import type { VoiceFragment } from "@/types/voice";

export type ExpressionLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/**
 * Transcript fragments grouped into spoken lines, both roles, in order. A
 * line is one speaker's run of fragments without an audible gap; a user
 * line keeps its identity while it grows, so what was performed for it can
 * be remembered. Only the last few lines are state for Jev.
 */
export function expressionLines(
  callId: string,
  fragments: VoiceFragment[],
  keep = 8,
): ExpressionLine[] {
  const lines: ExpressionLine[] = [];
  let previousEnd: number | null | undefined;
  fragments.forEach((fragment, i) => {
    const last = lines.at(-1);
    const gap =
      fragment.start_ms != null && previousEnd != null
        ? fragment.start_ms - previousEnd
        : 0;
    if (last && last.role === fragment.role && gap < 1500)
      last.text += fragment.delta;
    else
      lines.push({
        id: `line:${callId}:${i}`,
        role: fragment.role,
        text: fragment.delta,
      });
    previousEnd = fragment.end_ms;
  });
  return lines.filter((line) => line.text.trim()).slice(-keep);
}
