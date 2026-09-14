import type { Message } from "@/types/conversation";

export type PositionedReply = { message: Message; afterFragment: number };
type Reply = {
  id: string;
  content: string;
  turnStart: number;
  hasDelta: boolean;
  afterFragment: number;
  userFragments: number;
  orderUncertain: boolean;
};
export class VoiceReplies {
  private current = new Map<string, Reply>();
  private replies: Reply[] = [];
  constructor(private callId: () => string) {}
  accept(
    delegation: string,
    event: Record<string, unknown>,
    afterFragment = 0,
    userFragments = 0,
    recovered = false,
  ) {
    if (!["text_delta", "final_response"].includes(String(event.type)))
      return false;
    let reply = this.current.get(delegation);
    const hasContent = typeof event.content === "string" && !!event.content;
    // A continuation after another user utterance belongs below that utterance.
    // Deltas/finalization of an already-streaming turn keep their original slot.
    if (
      hasContent &&
      (!reply ||
        (!recovered &&
          !reply.hasDelta &&
          reply.turnStart > 0 &&
          userFragments > reply.userFragments))
    ) {
      reply = {
        id: `backend:${this.callId()}:${delegation}:reply:${this.replies.length}`,
        content: "",
        turnStart: 0,
        hasDelta: false,
        afterFragment,
        userFragments,
        orderUncertain: recovered,
      };
      this.current.set(delegation, reply);
      this.replies.push(reply);
    }
    if (!reply) return false;
    if (
      event.type === "text_delta" &&
      typeof event.content === "string" &&
      event.content
    ) {
      if (reply.content && (!reply.hasDelta || event.segment_started === true))
        reply.content += "\n\n";
      reply.content += event.content;
      reply.hasDelta = true;
    }
    if (event.type === "final_response") {
      if (typeof event.content === "string" && event.content) {
        const prior = reply.content.slice(0, reply.turnStart);
        reply.content = prior + (prior ? "\n\n" : "") + event.content;
      }
      reply.turnStart = reply.content.length;
      reply.hasDelta = false;
    }
    return true;
  }
  positioned(): PositionedReply[] {
    return this.replies
      .filter((reply) => reply.content)
      .map(({ id, content, afterFragment, orderUncertain }) => ({
        afterFragment,
        message: {
          id,
          content,
          role: "assistant",
          source: "backend",
          ...(orderUncertain ? { orderUncertain: true } : {}),
        },
      }));
  }
  messages(): Message[] {
    return this.positioned().map((reply) => reply.message);
  }
}
