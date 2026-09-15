/**
 * Server-only runtime routing. One assistant-runtime instance serves text,
 * voice and body; the optional per-role URLs remain as overrides only.
 */
const DEFAULT_RUNTIME_URL = "http://127.0.0.1:7100";
export const DEFAULT_BODY_MODEL = "openai:gpt-6-astra";
export const DEFAULT_BODY_THINKING_BUDGET = 4000;

type Env = Record<string, string | undefined>;

function trim(url: string) {
  return url.replace(/\/$/, "");
}

export function runtimeUrl(role: "text" | "body" | "voice", env: Env = process.env) {
  const override =
    role === "body"
      ? env.BODY_RUNTIME_URL
      : role === "voice"
        ? env.VOICE_RUNTIME_URL
        : undefined;
  return trim(override || env.RUNTIME_URL || DEFAULT_RUNTIME_URL);
}

/**
 * Body decisions select their own model on the shared instance so text keeps
 * the runtime's primary model. Values a caller already supplied win; the
 * server never overwrites an explicit request. Service tier stays a runtime
 * startup setting until assistant-runtime accepts it per request.
 */
export type BodyConfig = { default_model: string; thinking_budget: number };
export function withBodyConfig<T extends Record<string, unknown>>(
  body: T,
  env: Env = process.env,
): T & { config: BodyConfig & Record<string, unknown> } {
  const supplied =
    body.config && typeof body.config === "object"
      ? (body.config as Record<string, unknown>)
      : {};
  const budget = Number(env.BODY_THINKING_BUDGET);
  return {
    ...body,
    config: {
      default_model: env.BODY_MODEL || DEFAULT_BODY_MODEL,
      thinking_budget:
        Number.isInteger(budget) && budget > 0
          ? budget
          : DEFAULT_BODY_THINKING_BUDGET,
      ...supplied,
    },
  };
}
