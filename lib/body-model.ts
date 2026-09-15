/**
 * Body model selection. The choice lives in this browser only and travels
 * with each Body decision as `config.default_model`; the server fills in a
 * default when nothing is chosen. Candidates are ordered by expected planning
 * speed for a ~200-token movement plan; availability depends on the runtime's
 * configured providers.
 */
export type BodyModelOption = {
  id: string;
  label: string;
  note: string;
};

export const BODY_MODEL_DEFAULT = "";
export const BODY_MODEL_STORAGE_KEY = "avatar-studio.body-model";

export const BODY_MODEL_OPTIONS: readonly BodyModelOption[] = [
  { id: BODY_MODEL_DEFAULT, label: "Runtime default", note: "server choice" },
  {
    id: "cerebras:gpt-oss-120b",
    label: "GPT-OSS 120B · Cerebras",
    note: "~1,700 t/s, needs Cerebras key",
  },
  {
    id: "cerebras:qwen-3.8-27b",
    label: "Qwen 3.8 27B · Cerebras",
    note: "~1,850 t/s, needs Cerebras key",
  },
  {
    id: "google:gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    note: "~300 t/s, needs Google key",
  },
  {
    id: "openrouter:x-ai/grok-4.1-fast",
    label: "Grok 4.1 Fast · OpenRouter",
    note: "~120 t/s, needs OpenRouter key",
  },
  {
    id: "openai:gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    note: "Codex subscription",
  },
  {
    id: "openai:gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    note: "Codex subscription",
  },
  {
    id: "openai:gpt-6-astra",
    label: "GPT-6 Astra",
    note: "~50 t/s, Codex subscription",
  },
];

const pattern = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._/:-]*$/;

/** A valid runtime model id (provider:name), or null. Empty means default. */
export function normalizeBodyModel(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (!trimmed) return BODY_MODEL_DEFAULT;
  return pattern.test(trimmed) ? trimmed : null;
}

export function readBodyModel(storage: Pick<Storage, "getItem"> | null) {
  try {
    return normalizeBodyModel(storage?.getItem(BODY_MODEL_STORAGE_KEY)) ?? "";
  } catch {
    return BODY_MODEL_DEFAULT;
  }
}

export function writeBodyModel(
  storage: Pick<Storage, "setItem" | "removeItem"> | null,
  model: string,
) {
  try {
    if (model) storage?.setItem(BODY_MODEL_STORAGE_KEY, model);
    else storage?.removeItem(BODY_MODEL_STORAGE_KEY);
  } catch {
    // Storage may be unavailable; the in-memory choice still applies.
  }
}

let current = BODY_MODEL_DEFAULT;
let loaded = false;
const listeners = new Set<(model: string) => void>();

function storage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

/** The current choice; loads the stored value once in the browser. */
export function currentBodyModel() {
  if (!loaded) {
    current = readBodyModel(storage());
    loaded = true;
  }
  return current;
}

export function setBodyModel(value: string) {
  const model = normalizeBodyModel(value);
  if (model === null) return false;
  current = model;
  loaded = true;
  writeBodyModel(storage(), model);
  for (const listener of listeners) listener(model);
  return true;
}

export function subscribeBodyModel(listener: (model: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Request config for a Body decision; empty when the runtime default applies. */
export function bodyModelConfig(model = currentBodyModel()) {
  return model ? { config: { default_model: model } } : {};
}
