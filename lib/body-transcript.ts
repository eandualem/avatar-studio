import type { Message } from "@/types/conversation";
import type { VoiceFragment } from "@/types/voice";
import { spokenMessages } from "./voice-transcript";

// The body utterance keeps its identity if Live talks between two fragments of
// the same user speech. Audible gaps, rather than assistant text, separate it.
export function bodyMessages(
  callId: string,
  fragments: VoiceFragment[],
  history: Message[],
): Message[] {
  const last = fragments.findLastIndex((f) => f.role === "user");
  if (last < 0) return history;
  let first = last;
  let current = last;
  for (let i = last - 1; i >= 0; i--) {
    if (fragments[i].role !== "user") continue;
    const end = fragments[i].end_ms,
      start = fragments[current].start_ms;
    const same =
      start != null && end != null ? start - end < 1500 : i === current - 1;
    if (!same) break;
    first = current = i;
  }
  const text = fragments
    .slice(first, last + 1)
    .filter((f) => f.role === "user")
    .map((f) => f.delta)
    .join("");
  const prior = spokenMessages(callId, fragments.slice(0, first));
  return [
    ...history,
    ...prior,
    { id: `body-user:${callId}:${first}`, role: "user", content: text },
  ];
}
