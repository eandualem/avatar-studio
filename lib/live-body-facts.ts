import type { BodyAction } from "./body-action";

export type FactReceipt = {
  eventId: string;
  actionId: string;
  revision: number;
  status: string;
  sentAt: number;
  acknowledgedAt?: number;
  error?: string;
};
export class LiveBodyFacts {
  private pending = new Map<
    string,
    { receipt: FactReceipt; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(
    private channel: RTCDataChannel,
    private changed: (receipt: FactReceipt) => void,
  ) {
    channel.addEventListener("message", this.receive);
  }
  send(action: BodyAction) {
    const eventId = `body-${crypto.randomUUID()}`;
    const receipt: FactReceipt = {
      eventId,
      actionId: action.id,
      revision: action.revision,
      status: action.status,
      sentAt: performance.now(),
    };
    if (this.channel.readyState !== "open") {
      this.changed({ ...receipt, error: "Live context channel unavailable" });
      return;
    }
    const timer = setTimeout(
      () => this.finish(eventId, "Live context acknowledgment timed out"),
      10000,
    );
    this.pending.set(eventId, { receipt, timer });
    this.changed(receipt);
    try {
      this.channel.send(
        JSON.stringify({
          type: "session.thinking.append",
          event_id: eventId,
          delegation_id: null,
          // Bounded application facts only. No controller prose, instructions,
          // screenshots, user utterance, or per-frame state is forwarded.
          content: JSON.stringify({
            source: "avatar-engine",
            action_id: action.id,
            revision: action.revision,
            status: action.status,
            movement: action.label,
            detail: action.detail?.slice(0, 180),
          }),
        }),
      );
    } catch {
      this.finish(eventId, "Live context send failed");
    }
  }
  private receive = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "session.thinking.appended")
        this.finish(data.client_event_id);
      else if (data.type === "error")
        this.finish(data.error?.client_event_id, "Live context rejected");
    } catch {
      /* Other data-channel events are not acknowledgments. */
    }
  };
  private finish(id: string, error?: string) {
    const item = this.pending.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    this.pending.delete(id);
    this.changed({
      ...item.receipt,
      ...(error ? { error } : { acknowledgedAt: performance.now() }),
    });
  }
  close() {
    this.channel.removeEventListener("message", this.receive);
    for (const id of this.pending.keys())
      this.finish(id, "Live call ended before acknowledgment");
  }
}
