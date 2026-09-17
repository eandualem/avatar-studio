import type { MotionController, Motion, MotionResult } from "@/types/avatar";
import type { Message, Pending, ToolReceipt } from "@/types/conversation";
import type { JevAnswers, JevQuestion } from "@/types/jev";
import type {
  BodyAction,
  BodyRequest,
  BodyTransport,
  BodyView,
  Pulse,
} from "./body-controller";
import { bodyContext, bodyDecision } from "./body-tools";
import type { ExpressionLine } from "./expression-lines";
import {
  NOT_IN_LIBRARY,
  gestureLibrary,
  gestureName,
  learnGesture,
  libraryCriteria,
  libraryDigest,
  endsAtRest,
  microGestures,
  normalizeLearned,
  shapeGesture,
  type Gesture,
} from "./gesture-library";
import { choice, noul, score, type Oracle } from "./jev";

export type Thresholds = {
  /** Start a gesture from a line that has settled. */
  start: number;
  /** Start an incidental gesture while the line is still being spoken. */
  startPartial: number;
  /** Start an explicit request while the line is still being spoken. */
  startExplicitPartial: number;
  stop: number;
  /** Confidence that a user line is an explicit movement request. */
  explicit: number;
  /** Gesture confidence for an explicit request while the line is still being spoken, and once it is done. */
  gesture: number;
  gestureDone: number;
  /** Below this, the library does not cover an explicit request: ask the planner. */
  covered: number;
  /** Probability of the most likely body language before it runs, and of "none" before stillness wins. */
  micro: number;
  microStill: number;
};
export type ExpressionOptions = {
  initialStill?: boolean;
  /** Quiet time after the last fragment before a line counts as complete. */
  settleMs?: number;
  /** Floor between two Jev calls. */
  minIntervalMs?: number;
  /** An incidental gesture is not repeated within this window. */
  cooldownMs?: number;
  /** Least time between two pieces of body language, and before the same one again. */
  microGapMs?: number;
  microCooldownMs?: number;
  /** While nobody speaks, ask again this often so Charlie idles visibly. */
  idleTickMs?: number;
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
  microGapMs: 2500,
  microCooldownMs: 8000,
  idleTickMs: 5000,
  thresholds: {
    start: 0.6,
    startPartial: 0.8,
    startExplicitPartial: 0.7,
    stop: 0.85,
    explicit: 0.6,
    gesture: 0.7,
    gestureDone: 0.5,
    covered: 0.5,
    micro: 0.2,
    microStill: 0.6,
  },
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
          examples: [
            "can you clap?",
            "wave at me",
            "look left",
            "clap",
            "run!",
          ],
        },
        incidental: {
          what: "No request, but body language would fit the moment",
          examples: [
            "hey Charlie!",
            "hmm that's a hard one",
            "that's hilarious",
          ],
        },
        none: {
          what: "Nothing in the latest user line calls for body movement",
          examples: [
            "what is the capital of France?",
            "tell me about yourself",
          ],
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
    covered: noul(
      "Does an entry in charlie.library perform EXACTLY what the latest USER line asks for, including which hand or hands, which side, and the manner?",
      {
        true: {
          what: "The request is a plain instance of one entry's description, or is not a movement request at all",
          examples: [
            "'can you wave' with an entry 'wave: raise the left hand and wave it'",
            "'clap for me' with an entry 'clap: bring both hands together repeatedly'",
            "'what time is it', which asks for no movement",
          ],
        },
        false: {
          what: "The request adds or changes something no entry describes: the other hand, both hands, a direction, a different action",
          examples: [
            "'wave with both hands' when the only wave entry uses one hand",
            "'wave with your right hand' when the wave entry uses the left",
            "'do a cartwheel' with no cartwheel entry",
          ],
        },
      },
    ),
    stop: noul(
      "Does the latest USER line tell Charlie to stop moving, hold still, or quit what his body is doing?",
      {
        true: {
          what: "Any request to stop, calm or quit the body's current movement",
          examples: [
            "stop",
            "okay okay stop",
            "hold still",
            "enough",
            "can you not clap",
          ],
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
    sustain: score("How long should a movement Charlie starts now go on?", [
      { what: "brief; one or two beats", examples: ["a quick hello", "a nod"] },
      { what: "normal", examples: ["an ordinary request", "a joke"] },
      {
        what: "extended; keep it going",
        examples: [
          "keep clapping",
          "a long celebration",
          "dance for a while",
          "run!",
        ],
      },
    ]),
    body_language: choice(
      "Charlie is an expressive, engaged robot who is never a statue. Apart from any gesture above: which small body language would he show right now, given who is speaking and what is being said?",
      {
        ...libraryCriteria(microGestures, false),
        none: {
          what: "Complete stillness is better right now: a grave moment, or the body would distract from the words",
          examples: [
            "bad news being delivered",
            "the user asked him to hold still",
          ],
        },
      },
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
  private pulse?: Pulse;
  private pulses: Pulse[] = [];
  private calls = 0;
  private opened = performance.now();
  private latest?: { lines: ExpressionLine[]; speaking: boolean };
  private lastKey = "";
  private lastFragmentAt = 0;
  /** The pose a completed action left, until something returns to rest. */
  private pose?: string;
  private lastMicroAt = -Infinity;
  private lastMicro = new Map<string, number>();
  private idleTicks = 0;
  private idle?: ReturnType<typeof setTimeout>;
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
      pulses: this.pulses,
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
    clearTimeout(this.idle);
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
    // A new user line starts a fresh once-per-line account. A plan already
    // composing survives it: a correction or a repeat of the same request
    // waits for that plan; only a stop, a snapshot or an explicit request the
    // library can serve cancels it (see act).
    const user = lines.findLast((l) => l.role === "user");
    if (user && user.id !== this.lineId) {
      this.lineId = user.id;
      this.performed = new Set();
    }
    this.latest = { lines, speaking };
    this.idleTicks = 0;
    clearTimeout(this.settle);
    clearTimeout(this.idle);
    this.settle = setTimeout(() => {
      this.schedule(true);
      this.tick();
    }, this.options.settleMs);
    this.schedule(false);
  }
  /** Silence: ask again every few seconds so Charlie can idle, up to two minutes. */
  private tick() {
    clearTimeout(this.idle);
    if (this.closed || this.idleTicks >= 24) return;
    this.idle = setTimeout(() => {
      this.idleTicks++;
      this.schedule(true);
      this.tick();
    }, this.options.idleTickMs);
  }
  private key(lines: ExpressionLine[], complete: boolean) {
    return JSON.stringify([
      lines.map((l) => [l.id, l.text]),
      complete,
      this.moving?.action.id,
      [...this.performed],
      this.idleTicks,
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
        library: libraryDigest(library),
        speaking_now: speaking,
        silence_seconds: this.idleTicks
          ? Math.round((performance.now() - this.lastFragmentAt) / 1000)
          : 0,
        body: this.moving
          ? `${this.moving.action.label} (${this.moving.action.intent}), started ${((performance.now() - (this.moving.action.startedAt ?? performance.now())) / 1000).toFixed(1)}s ago`
          : this.pose
            ? `holding the pose left by ${this.pose}; not at rest`
            : "standing at rest",
        holding_still: this.still,
        performed_for_latest_user_line: [...this.performed],
      },
    };
    const last = lines.at(-1);
    const pulse: Pulse = {
      calls: ++this.calls,
      at: Math.round(sentAt - this.opened),
      latencyMs: 0,
      line: `${last?.role === "user" ? "user" : "charlie"}: ${last?.text.trim().slice(-80) ?? ""}${complete ? "" : " …"}`,
      verdict: "",
      outcome: "",
    };
    let answers: JevAnswers | undefined;
    try {
      answers = await this.oracle.ask(
        state,
        expressionQuestions(library),
        abort.signal,
      );
      pulse.verdict = summarize(answers);
    } catch (error) {
      if (!abort.signal.aborted && !this.closed)
        pulse.error = error instanceof Error ? error.message : "Jev failed";
    } finally {
      if (this.inFlight === abort) this.inFlight = undefined;
    }
    if (this.closed || abort.signal.aborted) return;
    pulse.latencyMs = Math.round(performance.now() - sentAt);
    pulse.outcome = answers
      ? this.act(answers, lines, complete, library, { sentAt, utteranceAt })
      : "no answer";
    this.pulse = pulse;
    this.pulses = [...this.pulses, pulse].slice(-60);
    // The experiment's log: one line per Jev round trip, readable in DevTools
    // and copied with "Copy Body details".
    console.info(
      `[expression] #${pulse.calls} +${pulse.at}ms ${pulse.latencyMs}ms | ${pulse.line} | ${pulse.error ?? pulse.verdict} | ${pulse.outcome}`,
    );
    this.publish();
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
  /** Applies the thresholds; returns what happened, for the trace. */
  private act(
    a: JevAnswers,
    lines: ExpressionLine[],
    complete: boolean,
    library: Gesture[],
    timing: { sentAt: number; utteranceAt: number },
  ): string {
    const t = this.options.thresholds;
    const latest = lines.at(-1);
    const user = lines.findLast((l) => l.role === "user");
    const fromUser = latest?.role === "user";
    const stop = a.stop?.type === "noul" ? a.stop.noul : 0;
    const start = a.start?.type === "noul" ? a.start.noul : 0;
    const energy = a.energy?.type === "score" ? a.energy.score : 1.5;
    const sustain = a.sustain?.type === "score" ? a.sustain.score : 1;
    if (fromUser && stop >= t.stop && !this.performed.has("stop")) {
      this.performed.add("stop");
      this.stop("User asked to stop");
      return "stop";
    }
    const main = this.gesture(a, lines, complete, library, timing, {
      start,
      energy,
      sustain,
    });
    if (main.started) return main.outcome;
    const micro = this.bodyLanguage(a, user, timing, { energy, sustain });
    return micro ? `${main.outcome}; ${micro}` : main.outcome;
  }
  /** The main channel: an explicit request, or an incidental gesture Jev wants to start. */
  private gesture(
    a: JevAnswers,
    lines: ExpressionLine[],
    complete: boolean,
    library: Gesture[],
    timing: { sentAt: number; utteranceAt: number },
    scores: { start: number; energy: number; sustain: number },
  ): { started: boolean; outcome: string } {
    const t = this.options.thresholds;
    const latest = lines.at(-1);
    const user = lines.findLast((l) => l.role === "user");
    const fromUser = latest?.role === "user";
    const { start, energy, sustain } = scores;
    // The intent answer is about the latest user line even while Charlie is
    // replying to it, so an explicit request survives his reply; the user's
    // line is finished once he has started answering.
    const explicit = isExplicit(a.intent, t.explicit);
    const userDone = complete || !fromUser;
    const name = a.gesture?.type === "choice" ? a.gesture.choice : "";
    const confidence = a.gesture?.type === "choice" ? a.gesture.confidence : 0;
    const covered = a.covered?.type === "noul" ? a.covered.noul : 1;
    const no = (outcome: string) => ({ started: false, outcome });
    if (explicit) {
      // A request is gated on what was asked, not on Jev's appetite for a
      // new gesture: "go back to normal" is a request even when nothing new
      // seems to start.
      const bar = userDone ? t.gestureDone : t.gesture;
      if (confidence < bar)
        return no(
          `request unclear (${name} ${confidence.toFixed(2)} < ${bar}${complete ? "" : " partial"})`,
        );
    } else {
      const threshold = complete ? t.start : t.startPartial;
      if (start < threshold)
        return no(
          `no start (${start.toFixed(2)} < ${threshold}${complete ? "" : " partial"})`,
        );
    }
    if (name === NOT_IN_LIBRARY || (explicit && covered < t.covered)) {
      if (!explicit) return no("not in library, not explicit");
      if (this.planning) return no("planner still composing");
      if (this.performed.has("planner"))
        return no("planner already asked for this line");
      this.performed.add("planner");
      void this.plan(lines, timing);
      return {
        started: true,
        outcome: `planner asked (covered ${covered.toFixed(2)})`,
      };
    }
    const entry = library.find((g) => g.name === name);
    if (!entry) return no(`unknown gesture ${name}`);
    if (this.performed.has(name))
      return no(`${name} already performed for this line`);
    if (!explicit) {
      if (this.still) return no(`${name} skipped: holding still`);
      if (this.moving?.action.intent === "explicit")
        return no(
          `${name} skipped: explicit ${this.moving.action.label} running`,
        );
      if (this.moving?.action.label === name)
        return no(`${name} skipped: already running`);
      const last = this.lastPerformedAt.get(name);
      if (
        last !== undefined &&
        performance.now() - last < this.options.cooldownMs
      )
        return no(`${name} skipped: cooldown`);
    }
    this.performed.add(name);
    if (explicit && this.planning)
      this.invalidatePlan("Superseded by a request the library serves");
    const replaced = this.moving?.action.label;
    const action = this.action(
      name,
      explicit ? "explicit" : "incidental",
      user?.id ?? latest?.id ?? "",
      timing.utteranceAt,
      timing.sentAt,
    );
    action.toolReturnedAt = performance.now();
    void this.execute(action, shapeGesture(entry, energy, sustain));
    return {
      started: true,
      outcome: `${explicit ? "explicit" : "incidental"} ${name}, energy ${energy.toFixed(1)}${replaced ? ` (replaces ${replaced})` : ""}`,
    };
  }
  /** The quiet channel: small body language while talking, listening or idling. */
  private bodyLanguage(
    a: JevAnswers,
    user: ExpressionLine | undefined,
    timing: { sentAt: number; utteranceAt: number },
    scores: { energy: number; sustain: number },
  ): string | undefined {
    const t = this.options.thresholds;
    const answer =
      a.body_language?.type === "choice" ? a.body_language : undefined;
    if (!answer) return;
    // "none" is one option among ten; stillness wins only as a clear
    // majority, otherwise the most likely body language runs.
    const stillness = answer.probabilities.none ?? 0;
    if (stillness >= t.microStill) return `stillness ${stillness.toFixed(2)}`;
    const [name, probability] = Object.entries(answer.probabilities)
      .filter(([key]) => key !== "none")
      .sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    if (!name || probability < t.micro)
      return `${name || "body language"} ${probability.toFixed(2)} < ${t.micro}`;
    if (this.still || this.moving) return;
    const now = performance.now();
    if (now - this.lastMicroAt < this.options.microGapMs)
      return `${name}: too soon`;
    const last = this.lastMicro.get(name);
    if (last !== undefined && now - last < this.options.microCooldownMs)
      return `${name}: cooldown`;
    const entry = microGestures.find((g) => g.name === name);
    if (!entry) return;
    this.lastMicroAt = now;
    this.lastMicro.set(name, now);
    const action = this.action(
      name,
      "incidental",
      user?.id ?? "",
      timing.utteranceAt,
      timing.sentAt,
    );
    action.toolReturnedAt = now;
    void this.execute(
      action,
      shapeGesture(entry, scores.energy, scores.sustain),
    );
    return `body language ${name} ${probability.toFixed(2)}`;
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
        if (result.status === "completed")
          this.pose = endsAtRest(motion) ? undefined : action.label;
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
    if (this.planning) return;
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
      if (
        this.closed ||
        work.abort.signal.aborted ||
        revision !== this.revision
      ) {
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
        const motion = normalizeLearned(decision.label, decision.motion);
        const result = await this.execute(action, motion);
        if (result?.status === "completed" && user) {
          const name = gestureName(decision.label);
          this.performed.add(name);
          if (
            learnGesture({
              name,
              what: decision.label,
              examples: [user.text.trim().slice(0, 120)],
              motion,
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
  private invalidatePlan(detail = "Superseded before admission") {
    this.revision++;
    const planning = this.planning;
    this.planning = undefined;
    if (!planning) return;
    planning.work.abort.abort();
    this.state(planning.work.action, "canceled", detail);
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
    this.pose = undefined;
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
    clearTimeout(this.idle);
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
  if (a.energy?.type === "score")
    parts.push(`energy ${a.energy.score.toFixed(1)}`);
  if (a.sustain?.type === "score")
    parts.push(`sustain ${a.sustain.score.toFixed(1)}`);
  if (a.body_language?.type === "choice")
    parts.push(
      `bl ${a.body_language.choice} ${(a.body_language.probabilities[a.body_language.choice] ?? 0).toFixed(2)}`,
    );
  return parts.join(" · ");
}
