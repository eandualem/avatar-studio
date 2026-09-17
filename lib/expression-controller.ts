import type { MotionController, Motion, MotionResult } from "@/types/avatar";
import type { Message, Pending, ToolReceipt } from "@/types/conversation";
import type { JevAnswers, JevQuestion } from "@/types/jev";
import type {
  BodyAction,
  BodyRequest,
  BodyTransport,
  BodyView,
} from "./body-controller";
import { bodyContext, bodyDecision } from "./body-tools";
import type { ExpressionLine } from "./expression-lines";
import {
  NOT_IN_LIBRARY,
  gestureLibrary,
  gestureName,
  learnGesture,
  libraryCriteria,
  shapeGesture,
  type Gesture,
} from "./gesture-library";
import { choice, noul, score, type Oracle } from "./jev";

export type Thresholds = {
  /** Start a gesture from a line that has settled. */
  start: number;
  /** Start a gesture while the line is still being spoken. */
  startPartial: number;
  stop: number;
  /** Confidence that a user line is an explicit movement request. */
  explicit: number;
};
export type ExpressionOptions = {
  initialStill?: boolean;
  /** Quiet time after the last fragment before a line counts as complete. */
  settleMs?: number;
  /** Floor between two Jev calls. */
  minIntervalMs?: number;
  /** An incidental gesture is not repeated within this window. */
  cooldownMs?: number;
  thresholds?: Partial<Thresholds>;
  library?: () => Gesture[];
};
const defaults: Required<Omit<ExpressionOptions, "library" | "thresholds">> & {
  thresholds: Thresholds;
} = {
  initialStill: false,
  settleMs: 800,
  minIntervalMs: 250,
  cooldownMs: 6000,
  thresholds: { start: 0.6, startPartial: 0.8, stop: 0.85, explicit: 0.6 },
};

/** The questions Jev answers on every transcript change, in one call. */
export function expressionQuestions(
  library: Gesture[],
): Record<string, JevQuestion> {
  return {
    intent: choice(
      "Does the latest USER line ask Charlie, the robot, for physical movement?",
      {
        explicit: {
          what: "The user asks Charlie to move, including as a question or a bare verb",
          examples: ["can you clap?", "wave at me", "look left", "clap", "run!"],
        },
        incidental: {
          what: "No request, but body language would fit the moment",
          examples: ["hey Charlie!", "hmm that's a hard one", "that's hilarious"],
        },
        none: {
          what: "Nothing in the latest user line calls for body movement",
          examples: ["what is the capital of France?", "tell me about yourself"],
        },
      },
    ),
    start: noul(
      "Given the latest line and what Charlie's body is already doing, should Charlie START a new gesture or posture now, rather than continue or do nothing?",
      {
        true: {
          what: "A new visible body action fits the latest line or was asked for, and it has not been performed for this line yet",
          examples: [
            "hey Charlie! -> wave",
            "can you clap -> clap",
            "hahaha -> laugh",
            "Charlie says: let me think -> thinking",
          ],
        },
        false: {
          what: "Keep going as is, or no body language is called for",
          examples: [
            "a factual question",
            "the same gesture was already performed for this line",
            "the user asked to stop",
          ],
        },
      },
    ),
    gesture: choice(
      "If Charlie starts a new gesture or posture now, which one?",
      libraryCriteria(library),
    ),
    stop: noul(
      "Does the latest USER line tell Charlie to stop moving, hold still, or quit what his body is doing?",
      {
        true: {
          what: "Any request to stop, calm or quit the body's current movement",
          examples: ["stop", "okay okay stop", "hold still", "enough", "can you not clap"],
        },
        false: {
          what: "No such request",
          examples: ["can you clap?", "hello", "what time is it"],
        },
      },
    ),
    energy: score(
      "How much energy does this moment call for in Charlie's body?",
      [
        { what: "still, quiet", examples: ["a serious question", "silence"] },
        { what: "small and calm", examples: ["ordinary chat"] },
        { what: "clear and lively", examples: ["a greeting", "good news"] },
        {
          what: "big and playful",
          examples: ["a joke landed", "celebration", "the user is laughing"],
        },
      ],
    ),
  };
}

type Work = { action: BodyAction; abort: AbortController };
const isExplicit = (a: JevAnswers["intent"], threshold: number) =>
  a?.type === "choice" && a.choice === "explicit" && a.confidence >= threshold;

/**
 * Charlie's continuous expression during a live call. Every transcript change,
 * from the user or from Charlie's own speech, becomes one Jev call that
 * answers several questions at once; code then admits at most one movement
 * from the library, asks the planner for a movement the library lacks and
 * learns the result, or stops. This is the only route that moves Charlie
 * during a call.
 */
export class ExpressionController {
  private revision = 0;
  private closed = false;
  private still: boolean;
  private moving?: Work;
  private planning?: { work: Work; request: BodyRequest };
  private actions: BodyAction[] = [];
  private pulse?: BodyView["pulse"];
  private calls = 0;
  private latest?: { lines: ExpressionLine[]; speaking: boolean };
  private lastKey = "";
  private lastFragmentAt = 0;
  private settle?: ReturnType<typeof setTimeout>;
  private next?: ReturnType<typeof setTimeout>;
  private inFlight?: AbortController;
  private queued = false;
  private lineId = "";
  private performed = new Set<string>();
  private lastPerformedAt = new Map<string, number>();
  private options: typeof defaults;
  private library: () => Gesture[];
  constructor(
    private controller: MotionController,
    private oracle: Oracle,
    private planner: BodyTransport,
    private changed: (view: BodyView) => void,
    private fact: (action: BodyAction) => void,
    private warning: (message: string) => void,
    options: ExpressionOptions = {},
  ) {
    this.options = {
      ...defaults,
      ...options,
      thresholds: { ...defaults.thresholds, ...options.thresholds },
    };
    this.library = options.library ?? gestureLibrary;
    this.still = this.options.initialStill;
  }
  snapshot(): BodyView {
    return structuredClone({
      active: this.moving?.action,
      still: this.still,
      actions: this.actions,
      pulse: this.pulse,
    });
  }
  private publish() {
    this.changed(this.snapshot());
  }
  private state(
    action: BodyAction,
    status: BodyAction["status"],
    detail?: string,
  ) {
    action.status = status;
    action.detail = detail;
    if (["completed", "canceled", "failed", "held"].includes(status))
      action.endedAt = performance.now();
    this.publish();
    if (
      status === "failed" ||
      (action.intent === "explicit" &&
        ["started", "completed", "canceled", "held"].includes(status))
    )
      this.fact(structuredClone(action));
  }
  private record(action: BodyAction) {
    this.actions = [...this.actions, action].slice(-100);
  }

  /** A snapshot is context only: nothing in it is performed. */
  reconcile(lines: ExpressionLine[]) {
    this.invalidatePlan();
    clearTimeout(this.settle);
    clearTimeout(this.next);
    this.queued = false;
    this.latest = undefined;
    const user = lines.findLast((l) => l.role === "user");
    this.lineId = user?.id ?? "";
    this.performed = new Set();
    this.lastKey = this.key(lines, false);
    this.publish();
  }
  /** Called on every transcript fragment, either role. */
  observe(lines: ExpressionLine[], speaking: boolean) {
    if (this.closed) return;
    this.lastFragmentAt = performance.now();
    const user = lines.findLast((l) => l.role === "user");
    if (user && user.id !== this.lineId) {
      this.lineId = user.id;
      this.performed = new Set();
      this.invalidatePlan();
    }
    this.latest = { lines, speaking };
    clearTimeout(this.settle);
    this.settle = setTimeout(() => this.schedule(true), this.options.settleMs);
    this.schedule(false);
  }
  private key(lines: ExpressionLine[], complete: boolean) {
    return JSON.stringify([
      lines.map((l) => [l.id, l.text]),
      complete,
      this.moving?.action.id,
      [...this.performed],
    ]);
  }
  private schedule(complete: boolean) {
    if (this.closed || !this.latest) return;
    const key = this.key(this.latest.lines, complete);
    if (key === this.lastKey) return;
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.lastKey = key;
    void this.ask(complete);
  }
  private isComplete() {
    return performance.now() - this.lastFragmentAt >= this.options.settleMs;
  }
  private async ask(complete: boolean) {
    const { lines, speaking } = this.latest!;
    const abort = new AbortController();
    this.inFlight = abort;
    const library = this.library();
    const sentAt = performance.now();
    const utteranceAt = this.lastFragmentAt;
    const state = {
      conversation: lines.map((line, i) => ({
        speaker: line.role === "user" ? "user" : "charlie",
        text: line.text,
        ...(i === lines.length - 1
          ? { transcript: complete ? "complete" : "partial, still speaking" }
          : {}),
      })),
      charlie: {
        speaking_now: speaking,
        body: this.moving
          ? `${this.moving.action.label} (${this.moving.action.intent}), started ${((performance.now() - (this.moving.action.startedAt ?? performance.now())) / 1000).toFixed(1)}s ago`
          : "idle, standing",
        holding_still: this.still,
        performed_for_latest_user_line: [...this.performed],
      },
    };
    let answers: JevAnswers | undefined;
    try {
      answers = await this.oracle.ask(
        state,
        expressionQuestions(library),
        abort.signal,
      );
      this.calls++;
      this.pulse = {
        calls: this.calls,
        latencyMs: performance.now() - sentAt,
        verdict: summarize(answers),
      };
    } catch (error) {
      if (!abort.signal.aborted && !this.closed) {
        this.calls++;
        this.pulse = {
          calls: this.calls,
          latencyMs: performance.now() - sentAt,
          verdict: "",
          error: error instanceof Error ? error.message : "Jev failed",
        };
      }
    } finally {
      if (this.inFlight === abort) this.inFlight = undefined;
    }
    if (this.closed || abort.signal.aborted) return;
    this.publish();
    if (answers)
      this.act(answers, lines, complete, library, { sentAt, utteranceAt });
    if (this.queued) {
      this.queued = false;
      const wait = Math.max(
        0,
        this.options.minIntervalMs - (performance.now() - sentAt),
      );
      clearTimeout(this.next);
      this.next = setTimeout(() => this.schedule(this.isComplete()), wait);
    }
  }
  private act(
    a: JevAnswers,
    lines: ExpressionLine[],
    complete: boolean,
    library: Gesture[],
    timing: { sentAt: number; utteranceAt: number },
  ) {
    const t = this.options.thresholds;
    const latest = lines.at(-1);
    const user = lines.findLast((l) => l.role === "user");
    const fromUser = latest?.role === "user";
    const stop = a.stop?.type === "noul" ? a.stop.noul : 0;
    const start = a.start?.type === "noul" ? a.start.noul : 0;
    const energy = a.energy?.type === "score" ? a.energy.score : 1.5;
    if (fromUser && stop >= t.stop && !this.performed.has("stop")) {
      this.performed.add("stop");
      this.stop("User asked to stop");
      return;
    }
    if (start < (complete ? t.start : t.startPartial)) return;
    const explicit = fromUser && isExplicit(a.intent, t.explicit);
    const name = a.gesture?.type === "choice" ? a.gesture.choice : "";
    if (name === NOT_IN_LIBRARY) {
      if (explicit && !this.performed.has("planner")) {
        this.performed.add("planner");
        void this.plan(lines, timing);
      }
      return;
    }
    const entry = library.find((g) => g.name === name);
    if (!entry || this.performed.has(name)) return;
    if (this.moving?.action.label === name) return;
    if (!explicit) {
      if (this.still || this.moving?.action.intent === "explicit") return;
      const last = this.lastPerformedAt.get(name);
      if (last !== undefined && performance.now() - last < this.options.cooldownMs)
        return;
    }
    this.performed.add(name);
    const action = this.action(
      name,
      explicit ? "explicit" : "incidental",
      user?.id ?? latest?.id ?? "",
      timing.utteranceAt,
      timing.sentAt,
    );
    action.toolReturnedAt = performance.now();
    void this.execute(action, shapeGesture(entry, energy));
  }
  private action(
    label: string,
    intent: BodyAction["intent"],
    utteranceId: string,
    utteranceAt: number,
    requestedAt: number,
  ): BodyAction {
    const action: BodyAction = {
      id: crypto.randomUUID(),
      revision: this.revision,
      utteranceId,
      intent,
      label,
      status: "requested",
      utteranceAt,
      requestedAt,
    };
    this.record(action);
    this.publish();
    return action;
  }
  /** The final admission boundary; nothing awaited between here and execute. */
  private async execute(
    action: BodyAction,
    motion: Motion,
  ): Promise<MotionResult | undefined> {
    if (this.closed) return;
    if (action.intent === "explicit") this.still = false;
    this.cancelMovement(`Replaced by ${action.label}`);
    const work: Work = { action, abort: new AbortController() };
    this.moving = work;
    try {
      const result = await this.controller.execute(
        motion,
        work.abort.signal,
        () => {
          if (this.moving !== work || work.abort.signal.aborted || this.closed)
            return;
          action.startedAt = performance.now();
          this.state(action, "started");
          this.state(action, "ongoing");
        },
      );
      if (this.moving === work) {
        this.moving = undefined;
        this.lastPerformedAt.set(action.label, performance.now());
        this.state(
          action,
          result.status === "completed" ? "completed" : "canceled",
          result.constrained
            ? `Motion constrained: ${result.reasons?.join("; ") || "Some requested targets were limited"}`
            : undefined,
        );
      }
      return result;
    } catch (error) {
      if (this.moving === work) {
        this.moving = undefined;
        this.controller.stop();
      }
      if (work.abort.signal.aborted || this.closed) return;
      this.state(
        action,
        "failed",
        error instanceof Error ? error.message : "Movement failed",
      );
      this.warning(
        "Charlie could not perform that movement. You can keep talking.",
      );
      return;
    }
  }
  /** The library had nothing: the planner composes numbers, and a completed plan joins the library. */
  private async plan(
    lines: ExpressionLine[],
    timing: { sentAt: number; utteranceAt: number },
  ) {
    const user = lines.findLast((l) => l.role === "user");
    const revision = ++this.revision;
    const action = this.action(
      "Planning a new movement",
      "explicit",
      user?.id ?? "",
      timing.utteranceAt,
      performance.now(),
    );
    const messages: Message[] = lines.map((l) => ({
      id: l.id,
      role: l.role,
      content: l.text,
    }));
    const request: BodyRequest = {
      id: action.id,
      session_id: crypto.randomUUID(),
      revision,
      host_context: bodyContext(this.controller, messages, {
        current_action: this.moving?.action,
        still: this.still,
        revision,
      }),
    };
    const work: Work = { action, abort: new AbortController() };
    this.planning = { work, request };
    let pending: Pending | null | undefined;
    try {
      pending = await this.planner.decide(request, work.abort.signal);
      action.toolReturnedAt = performance.now();
      if (this.closed || work.abort.signal.aborted || revision !== this.revision) {
        if (pending)
          await this.planner.receipt(request, pending, {
            outcome: "failed",
            result: {
              status: "canceled",
              executed: false,
              reason: "Decision was superseded before engine admission",
            },
          });
        return;
      }
      this.planning = undefined;
      const decision = pending
        ? bodyDecision(pending)
        : { kind: "hold" as const, still: false };
      let receipt: ToolReceipt;
      if (decision.kind !== "move") {
        if (decision.kind === "stop" || decision.still) {
          this.still = true;
          this.cancelMovement("User requested stillness");
        }
        this.state(action, "held");
        receipt = { result: { status: "held", pose: this.controller.pose() } };
      } else {
        action.label = decision.label;
        action.intent = decision.intent;
        const result = await this.execute(action, decision.motion);
        if (result?.status === "completed" && user) {
          const name = gestureName(decision.label);
          if (
            learnGesture({
              name,
              what: decision.label,
              examples: [user.text.trim().slice(0, 120)],
              motion: decision.motion,
            })
          )
            action.detail = [action.detail, `Learned as ${name}`]
              .filter(Boolean)
              .join(". ");
          this.publish();
        }
        receipt = {
          result: result ?? { status: "canceled", executed: false },
        };
      }
      if (pending) await this.planner.receipt(request, pending, receipt);
    } catch (error) {
      if (work.abort.signal.aborted || this.closed) return;
      if (pending === undefined)
        void this.planner
          .cancel(request.session_id, request.id)
          .catch(() => {});
      if (this.planning?.work === work) this.planning = undefined;
      if (["completed", "held", "canceled"].includes(action.status)) {
        this.warning(
          "Movement result could not be confirmed. It will not be repeated.",
        );
        return;
      }
      const detail =
        error instanceof Error ? error.message : "Body decision failed";
      this.state(action, "failed", detail);
      this.warning(
        "Charlie could not plan that movement. You can keep talking.",
      );
      if (pending)
        void this.planner
          .receipt(request, pending, {
            outcome: "failed",
            result: { error: detail },
          })
          .catch(() => {});
    }
  }
  private invalidatePlan() {
    this.revision++;
    const planning = this.planning;
    this.planning = undefined;
    if (!planning) return;
    planning.work.abort.abort();
    this.state(planning.work.action, "canceled", "Superseded before admission");
    void this.planner
      .cancel(planning.request.session_id, planning.request.id)
      .catch(() => {});
  }
  private cancelMovement(detail: string) {
    const work = this.moving;
    this.moving = undefined;
    work?.abort.abort();
    this.controller.stop();
    if (work) this.state(work.action, "canceled", detail);
  }
  stop(detail = "Stopped by the user") {
    this.invalidatePlan();
    this.still = true;
    this.cancelMovement(detail);
    this.publish();
    if (!this.closed) this.confirmHeld(detail);
  }
  reset() {
    this.stop("Movement stopped for pose reset");
    if (!this.controller.reset)
      throw new Error("The avatar is not ready to reset.");
    this.controller.reset();
    this.confirmHeld("Initial pose restored by the engine");
  }
  private confirmHeld(label: string) {
    const now = performance.now();
    const action: BodyAction = {
      id: crypto.randomUUID(),
      revision: this.revision,
      utteranceId: "local-control",
      intent: "explicit",
      label,
      status: "held",
      utteranceAt: now,
      requestedAt: now,
      endedAt: now,
    };
    this.record(action);
    this.publish();
    this.fact(action);
  }
  close() {
    if (this.closed) return;
    const still = this.still;
    this.closed = true;
    clearTimeout(this.settle);
    clearTimeout(this.next);
    this.inFlight?.abort();
    this.stop("Live call ended");
    this.still = still;
    this.publish();
  }
}

function summarize(a: JevAnswers) {
  const parts: string[] = [];
  if (a.gesture?.type === "choice")
    parts.push(`${a.gesture.choice} ${a.gesture.confidence.toFixed(2)}`);
  if (a.start?.type === "noul") parts.push(`start ${a.start.noul.toFixed(2)}`);
  if (a.stop?.type === "noul") parts.push(`stop ${a.stop.noul.toFixed(2)}`);
  if (a.intent?.type === "choice") parts.push(a.intent.choice);
  if (a.energy?.type === "score") parts.push(`energy ${a.energy.score.toFixed(1)}`);
  return parts.join(" · ");
}
