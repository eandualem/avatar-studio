/**
 * Server-only runtime routing. One assistant-runtime instance serves text,
 * voice and body; the optional per-role URLs remain as overrides only.
 */
const DEFAULT_RUNTIME_URL = "http://127.0.0.1:7100";
/** Registered name in profiles/avatar-studio.toml; sent on every request. */
export const APP_PROFILE = "avatar_studio";
export const DEFAULT_TEXT_MODEL = "openai:gpt-5.6-sol";
export const DEFAULT_BODY_MODEL = "openai:gpt-6-astra";
export const DEFAULT_AUXILIARY_MODEL = "openai:gpt-5.6-luna";
export const DEFAULT_THINKING_BUDGET = 4000;

type Env = Record<string, string | undefined>;

function trim(url: string) {
  return url.replace(/\/$/, "");
}

export function runtimeUrl(
  role: "text" | "body" | "voice",
  env: Env = process.env,
) {
  const override =
    role === "body"
      ? env.BODY_RUNTIME_URL
      : role === "voice"
        ? env.VOICE_RUNTIME_URL
        : undefined;
  return trim(override || env.RUNTIME_URL || DEFAULT_RUNTIME_URL);
}

/**
 * App-owned request defaults on a shared backend: the registered profile and
 * the model/thinking/working-memory choices the launch file used to set. Values
 * a caller already supplied win; the server never overwrites an explicit
 * request. Provider keys, Codex-only, built-in tools, voice enablement and
 * ceilings remain runtime startup settings.
 */
export type RequestConfig = {
  default_model: string;
  thinking_budget: number;
  enable_working_memory: boolean;
  summarization_model: string;
  working_memory_model: string;
};
type Configured<T> = T & {
  profile: string;
  config: RequestConfig & Record<string, unknown>;
};

function budget(raw: string | undefined) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_THINKING_BUDGET;
}

function withConfig<T extends Record<string, unknown>>(
  body: T,
  env: Env,
  defaults: Pick<RequestConfig, "default_model" | "thinking_budget">,
): Configured<T> {
  const supplied =
    body.config && typeof body.config === "object"
      ? (body.config as Record<string, unknown>)
      : {};
  return {
    ...body,
    profile: typeof body.profile === "string" ? body.profile : APP_PROFILE,
    config: {
      ...defaults,
      enable_working_memory: false,
      // Auxiliary choices survive whatever the shared backend defaults to.
      summarization_model: env.AUXILIARY_MODEL || DEFAULT_AUXILIARY_MODEL,
      working_memory_model: env.AUXILIARY_MODEL || DEFAULT_AUXILIARY_MODEL,
      ...supplied,
    },
  };
}

/** Text conversations: TEXT_MODEL / TEXT_THINKING_BUDGET, Sol by default. */
export function withTextConfig<T extends Record<string, unknown>>(
  body: T,
  env: Env = process.env,
): Configured<T> {
  return withConfig(body, env, {
    default_model: env.TEXT_MODEL || DEFAULT_TEXT_MODEL,
    thinking_budget: budget(env.TEXT_THINKING_BUDGET),
  });
}

/** Body decisions: BODY_MODEL / BODY_THINKING_BUDGET, Astra by default. */
export function withBodyConfig<T extends Record<string, unknown>>(
  body: T,
  env: Env = process.env,
): Configured<T> {
  return withConfig(body, env, {
    default_model: env.BODY_MODEL || DEFAULT_BODY_MODEL,
    thinking_budget: budget(env.BODY_THINKING_BUDGET),
  });
}
