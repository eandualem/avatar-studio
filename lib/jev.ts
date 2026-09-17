import {
  jevResponseSchema,
  type JevAnswers,
  type JevQuestion,
} from "@/types/jev";

/** Question builders; the names mirror TypeSafe's SDK helpers. */
type Criteria = Extract<JevQuestion, { type: "choice" }>["criteria"];
export const noul = (
  instructions: string,
  criteria?: Extract<JevQuestion, { type: "noul" }>["criteria"],
): JevQuestion => ({ type: "noul", instructions, criteria });
export const choice = (instructions: string, criteria: Criteria): JevQuestion => ({
  type: "choice",
  instructions,
  criteria,
});
export const score = (
  instructions: string,
  criteria: Extract<JevQuestion, { type: "score" }>["criteria"],
): JevQuestion => ({ type: "score", instructions, criteria });

/** One System One call through the app's server route. */
export interface Oracle {
  ask(
    state: unknown,
    questions: Record<string, JevQuestion>,
    signal: AbortSignal,
  ): Promise<JevAnswers>;
}
export const jevOracle: Oracle = {
  async ask(state, questions, signal) {
    const response = await fetch("/api/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, questions }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.detail === "string" ? result.detail : "Jev is unavailable.",
      );
    return jevResponseSchema.parse(result).answers;
  },
};
