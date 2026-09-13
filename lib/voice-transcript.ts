import type { Message } from "@/types/conversation";
import type { VoiceFragment } from "@/types/voice";

export function spokenMessages(
  callId: string,
  fragments: VoiceFragment[],
): Message[] {
  const messages: Message[] = [];
  let previousEnd: number | null | undefined;
  for (const [i, fragment] of fragments.entries()) {
    const last = messages.at(-1);
    const gap =
      fragment.start_ms != null && previousEnd != null
        ? fragment.start_ms - previousEnd
        : 0;
    if (last && last.role === fragment.role && gap < 1500)
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
