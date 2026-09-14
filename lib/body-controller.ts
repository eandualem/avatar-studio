import type { MotionController } from "@/types/avatar";
import type { Message, Pending, ToolReceipt } from "@/types/conversation";
import { bodyContext, bodyDecision } from "./body-tools";

export type BodyRequest = {
  id: string;
  session_id: string;
  revision: number;
  host_context: ReturnType<typeof bodyContext>;
};
export interface BodyTransport {
  decide(request: BodyRequest, signal: AbortSignal): Promise<Pending | null>;
  receipt(
    request: BodyRequest,
    pending: Pending,
    receipt: ToolReceipt,
  ): Promise<void>;
  cancel(sessionId: string, requestId: string): Promise<void>;
}
export type BodyAction = {
  id: string;
  revision: number;
  utteranceId: string;
  intent: "explicit" | "incidental";
  label: string;
  status:
    | "requested"
    | "started"
    | "ongoing"
    | "completed"
    | "canceled"
    | "failed"
    | "held";
  utteranceAt: number;
  requestedAt: number;
  toolReturnedAt?: number;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
};
type Work = {
  request: BodyRequest;
  abort: AbortController;
  action: BodyAction;
};
export type BodyView = {
  active?: BodyAction;
  still: boolean;
  actions: BodyAction[];
};

// One controller owns one Live call. Decisions are event-driven; the engine alone
// advances motion. No text/receipt can recursively schedule another decision.
export class BodyController {
  private revision = 0;
  private closed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Work;
  private moving?: Work;
  private lastUser = "";
  private admitted = new Set<string>();
  private still = false;
  private actions: BodyAction[] = [];
  constructor(
    private controller: MotionController,
    private transport: BodyTransport,
    private changed: (view: BodyView) => void,
    private fact: (action: BodyAction) => void,
    private warning: (message: string) => void,
    private quietMs = 900,
    initialStill = false,
  ) {
    this.still = initialStill;
  }
  snapshot(): BodyView {
    return structuredClone({
      active: this.moving?.action,
      still: this.still,
      actions: this.actions,
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
  // Snapshots are context reconciliation only. Never replay actions from history.
  reconcile(messages: Message[]) {
    this.invalidate();
    const user = messages.findLast((m) => m.role === "user");
    this.lastUser = user ? `${user.id}:${user.content}` : "";
    for (const m of messages) if (m.role === "user") this.admitted.add(m.id);
    this.publish();
  }
  observe(messages: Message[]) {
    if (this.closed) return;
    const index = messages.findLastIndex((m) => m.role === "user");
    if (index < 0) return;
    const user = messages[index];
    if (!user.content.trim()) return;
    const key = `${user.id}:${user.content}`;
    if (key === this.lastUser) return;
    this.lastUser = key;
    this.invalidate();
    // A small, conservative fast path for unambiguous stops. Richer phrasing is
    // handled by stop_avatar; quoted words and "don't stop" are not commands.
    if (
      /^(?:please\s+)?(?:stop(?:\s+(?:moving|running|dancing|waving))?|freeze|stay still)[.!?\s]*$/i.test(
        user.content.trim(),
      )
    ) {
      this.stop("User requested stillness");
      this.admitted.add(user.id);
      return;
    }
    if (this.admitted.has(user.id)) return;
    const revision = this.revision;
    const utteranceAt = performance.now();
    const history = structuredClone(messages.slice(0, index + 1));
    this.timer = setTimeout(() => {
      void this.decide(user.id, history, revision, utteranceAt);
    }, this.quietMs);
  }
  private invalidate() {
    this.revision++;
    clearTimeout(this.timer);
    if (this.pending) {
      const work = this.pending;
      this.pending = undefined;
      work.abort.abort();
      this.state(work.action, "canceled", "Superseded before admission");
      void this.transport
        .cancel(work.request.session_id, work.request.id)
        .catch(() => {});
    }
  }
  private cancelMovement(detail: string) {
    const work = this.moving;
    this.moving = undefined;
    work?.abort.abort();
    this.controller.stop();
    if (work) this.state(work.action, "canceled", detail);
  }
  stop(detail = "Stopped by the user") {
    this.invalidate();
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
    this.actions = [...this.actions, action].slice(-100);
    this.publish();
    this.fact(action);
  }
  close() {
    if (this.closed) return;
    const still = this.still;
    this.closed = true;
    this.stop("Live call ended");
    this.still = still;
    this.publish();
  }
  private async decide(
    utteranceId: string,
    messages: Message[],
    revision: number,
    utteranceAt: number,
  ) {
    if (this.closed || revision !== this.revision) return;
    const action: BodyAction = {
      id: crypto.randomUUID(),
      revision,
      utteranceId,
      intent: "incidental",
      label: "Body decision",
      status: "requested",
      utteranceAt,
      requestedAt: performance.now(),
    };
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
    const work: Work = { request, action, abort: new AbortController() };
    this.pending = work;
    this.actions = [...this.actions, action].slice(-100);
    this.publish();
    let pending: Pending | null | undefined;
    try {
      pending = await this.transport.decide(request, work.abort.signal);
      action.toolReturnedAt = performance.now();
      if (
        this.closed ||
        work.abort.signal.aborted ||
        revision !== this.revision ||
        this.pending !== work
      )
        return;
      const decision = pending
        ? bodyDecision(pending)
        : { kind: "hold" as const, still: false };
      this.pending = undefined;
      let receipt: ToolReceipt;
      if (decision.kind !== "move") {
        if (decision.kind === "stop" || decision.still) {
          action.intent = "explicit";
          action.label = "Requested stillness";
          this.still = true;
          this.cancelMovement("User requested stillness");
        }
        this.state(action, "held");
        receipt = { result: { status: "held", pose: this.controller.pose() } };
      } else if (
        decision.intent === "incidental" &&
        (this.still || this.moving?.action.intent === "explicit")
      ) {
        this.state(
          action,
          "held",
          "Explicit movement or stillness has priority",
        );
        receipt = { result: { status: "held", reason: action.detail } };
      } else {
        this.admitted.add(utteranceId);
        action.intent = decision.intent;
        action.label = decision.label;
        if (decision.intent === "explicit") this.still = false;
        this.cancelMovement("Replaced by a new movement");
        // This is the final admission boundary: no awaited work between the
        // revision check and execute. A provider return is never a start event.
        if (
          this.closed ||
          work.abort.signal.aborted ||
          revision !== this.revision
        )
          return;
        this.moving = work;
        const result = await this.controller.execute(
          decision.motion,
          work.abort.signal,
          () => {
            if (
              this.moving !== work ||
              work.abort.signal.aborted ||
              this.closed
            )
              return;
            action.startedAt = performance.now();
            this.state(action, "started");
            this.state(action, "ongoing");
          },
        );
        if (this.moving === work) {
          this.moving = undefined;
          this.state(
            action,
            result.status === "completed" ? "completed" : "canceled",
            result.constrained
              ? `Motion constrained: ${result.reasons?.join("; ") || "Some requested targets were limited"}`
              : undefined,
          );
        }
        receipt = { result };
      }
      if (pending) await this.transport.receipt(request, pending, receipt);
    } catch (error) {
      if (work.abort.signal.aborted || this.closed) return;
      if (this.pending === work) this.pending = undefined;
      if (this.moving === work) {
        this.moving = undefined;
        this.controller.stop();
      }
      const detail =
        error instanceof Error ? error.message : "Body decision failed";
      if (["completed", "held", "canceled"].includes(action.status)) {
        this.warning(
          "Movement result could not be confirmed. It will not be repeated.",
        );
      } else {
        this.state(action, "failed", detail);
        this.warning(
          "Charlie could not complete that movement. You can keep talking.",
        );
        if (pending)
          void this.transport
            .receipt(request, pending, {
              outcome: "failed",
              result: { error: detail },
            })
            .catch(() => {});
      }
    }
  }
}
