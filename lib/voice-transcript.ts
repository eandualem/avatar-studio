import type { Message } from "@/types/conversation";
import type { VoiceFragment } from "@/types/voice";
import type { PositionedReply } from "./voice-replies";

export function spokenMessages(
  callId: string,
  fragments: VoiceFragment[],
): Message[] {
  return liveMessages(callId, fragments, []);
}

// Transcript indexes are append-only for a call and survive full snapshots.
// A backend reply anchors to the transcript position at its first visible text,
// not to its finalization time or the end of the current conversation.
export function liveMessages(
  callId: string,
  fragments: VoiceFragment[],
  replies: PositionedReply[],
): Message[] {
  const messages: Message[] = [];
  const anchored = new Map<number, Message[]>();
  for (const { message, afterFragment } of replies) {
    const index = Math.min(afterFragment, fragments.length);
    const bucket = anchored.get(index) ?? [];
    bucket.push(message);
    anchored.set(index, bucket);
  }
  let previousEnd: number | null | undefined;
  for (let i = 0; i <= fragments.length; i++) {
    messages.push(...(anchored.get(i) ?? []));
    const fragment = fragments[i];
    if (!fragment) break;
    const last = messages.at(-1);
    const gap =
      fragment.start_ms != null && previousEnd != null
        ? fragment.start_ms - previousEnd
        : 0;
    if (last?.source === "voice" && last.role === fragment.role && gap < 1500)
      last.content += fragment.delta;
    else
      messages.push({
        id: `voice:${callId}:${i}`,
        role: fragment.role,
        content: fragment.delta,
        source: "voice",
      });
    previousEnd = fragment.end_ms;
  }
  return messages;
}
