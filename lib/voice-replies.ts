import type { Message } from "@/types/conversation";

type Reply = {
  id: string;
  content: string;
  turnStart: number;
  hasDelta: boolean;
};
export class VoiceReplies {
  private replies = new Map<string, Reply>();
  constructor(private callId: () => string) {}
  accept(delegation: string, event: Record<string, unknown>) {
    if (!["text_delta", "final_response"].includes(String(event.type)))
      return false;
    const reply = this.replies.get(delegation) || {
      id: `backend:${this.callId()}:${delegation}:reply`,
      content: "",
      turnStart: 0,
      hasDelta: false,
    };
    if (event.type === "text_delta" && typeof event.content === "string") {
      if (reply.content && (!reply.hasDelta || event.segment_started === true))
        reply.content += "\n\n";
      reply.content += event.content;
      reply.hasDelta = true;
    }
    if (event.type === "final_response") {
      if (typeof event.message_id === "string")
        reply.id = `backend:${this.callId()}:${delegation}:${event.message_id}`;
      if (typeof event.content === "string" && event.content) {
        const prior = reply.content.slice(0, reply.turnStart);
        reply.content = prior + (prior ? "\n\n" : "") + event.content;
      }
      reply.turnStart = reply.content.length;
      reply.hasDelta = false;
    }
    this.replies.set(delegation, reply);
    return true;
  }
  messages(): Message[] {
    return [...this.replies.values()]
      .filter((reply) => reply.content)
      .map(({ id, content }) => ({
        id,
        content,
        role: "assistant",
        source: "backend",
      }));
  }
}
