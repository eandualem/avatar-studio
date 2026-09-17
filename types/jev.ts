import { z } from "zod";

/**
 * TypeSafe's System One API (Jev). A request is one state plus typed
 * questions; every answer is a value from the question's own closed set with
 * its probability, never free text. https://docs.typesafe.ai/api
 */
const criteriaEntry = z.union([
  z.string(),
  z.null(),
  z.object({
    what: z.string(),
    not_for: z.string().optional(),
    examples: z.array(z.string()).optional(),
  }),
]);
export const jevQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("noul"),
    instructions: z.string(),
    criteria: z
      .object({ true: criteriaEntry, false: criteriaEntry })
      .optional(),
  }),
  z.object({
    type: z.literal("choice"),
    instructions: z.string(),
    criteria: z.record(criteriaEntry),
  }),
  z.object({
    type: z.literal("score"),
    instructions: z.string(),
    criteria: z.array(criteriaEntry).min(2).max(10),
  }),
]);
export const jevRequestSchema = z.object({
  state: z.unknown(),
  questions: z.record(jevQuestionSchema).refine(
    (q) => Object.keys(q).length > 0,
    "At least one question",
  ),
});
export const jevAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: z.number().min(0).max(1),
    probabilities: z.record(z.number()),
  }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    confidence: z.number().min(0).max(1),
    probabilities: z.record(z.number()),
    legend: z.record(z.unknown()).optional(),
  }),
]);
export const jevResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(jevAnswerSchema),
  usage: z
    .object({ input_tokens: z.number(), output_tokens: z.number() })
    .partial()
    .optional(),
});
export type JevQuestion = z.infer<typeof jevQuestionSchema>;
export type JevAnswer = z.infer<typeof jevAnswerSchema>;
export type JevAnswers = Record<string, JevAnswer>;
