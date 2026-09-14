// Synthetic transcript for an isolated browser preview; no provider requests.
import { VoiceReplies } from "../../lib/voice-replies";
import { liveMessages } from "../../lib/voice-transcript";
import type { VoiceFragment } from "../../types/voice";

export function orderPreview(stage: number) {
  const fragments: VoiceFragment[] = [
    { role: "user", delta: "Please clap five times." },
  ];
  const replies = new VoiceReplies(() => "order-preview");
  const answer = (event: Record<string, unknown>) =>
    replies.accept(
      "clap",
      event,
      fragments.length,
      fragments.filter((f) => f.role === "user").length,
    );
  answer({ type: "text_delta", content: "I will clap five times." });
  answer({ type: "final_response", content: null });
  if (stage >= 1) fragments.push({ role: "user", delta: "Then run in place." });
  if (stage >= 2) {
    answer({ type: "text_delta", content: "The five claps are done." });
    answer({ type: "final_response", content: "The five claps are done." });
    fragments.push({ role: "assistant", delta: "I can run next." });
  }
  return liveMessages("order-preview", fragments, replies.positioned());
}
