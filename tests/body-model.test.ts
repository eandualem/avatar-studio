import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BODY_MODEL_OPTIONS,
  BODY_MODEL_STORAGE_KEY,
  bodyModelConfig,
  normalizeBodyModel,
  optionKey,
  readBodyModel,
  setBodyModel,
  currentBodyModel,
  subscribeBodyModel,
  writeBodyModel,
} from "@/lib/body-model";

class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

describe("normalizeBodyModel", () => {
  it("accepts provider:model ids and treats blank as the default", () => {
    expect(normalizeBodyModel(" Cerebras:GPT-OSS-120B ")).toBe(
      "cerebras:gpt-oss-120b",
    );
    expect(normalizeBodyModel("openrouter:openai/gpt-oss-120b:nitro")).toBe(
      "openrouter:openai/gpt-oss-120b:nitro",
    );
    expect(normalizeBodyModel("")).toBe("");
    expect(normalizeBodyModel(undefined)).toBe("");
  });
  it("rejects ids without a provider or with unsafe characters", () => {
    expect(normalizeBodyModel("gpt-oss-120b")).toBeNull();
    expect(normalizeBodyModel("openai:gpt 6")).toBeNull();
    expect(normalizeBodyModel("openai:<script>")).toBeNull();
  });
  it("lists only valid selections as options", () => {
    for (const option of BODY_MODEL_OPTIONS)
      expect(normalizeBodyModel(optionKey(option))).toBe(optionKey(option));
    expect(normalizeBodyModel("openai:gpt-6-astra@fast")).toBe(
      "openai:gpt-6-astra@fast",
    );
    expect(normalizeBodyModel("openai:gpt-6-astra@turbo")).toBeNull();
  });
  it("requests the Codex tier only for a fast selection", () => {
    expect(bodyModelConfig("openai:gpt-6-astra@fast")).toEqual({
      config: { default_model: "openai:gpt-6-astra", codex_service_tier: "fast" },
    });
    expect(bodyModelConfig("cerebras:gpt-oss-120b")).toEqual({
      config: { default_model: "cerebras:gpt-oss-120b" },
    });
  });
});

describe("storage", () => {
  it("round-trips and ignores corrupt values", () => {
    const storage = new MemoryStorage();
    writeBodyModel(storage, "cerebras:gpt-oss-120b");
    expect(readBodyModel(storage)).toBe("cerebras:gpt-oss-120b");
    writeBodyModel(storage, "");
    expect(storage.getItem(BODY_MODEL_STORAGE_KEY)).toBeNull();
    storage.setItem(BODY_MODEL_STORAGE_KEY, "not a model");
    expect(readBodyModel(storage)).toBe("");
    expect(readBodyModel(null)).toBe("");
  });
});

describe("current selection", () => {
  beforeEach(() => {
    setBodyModel("");
  });
  it("attaches the chosen model as request config and notifies listeners", () => {
    const listener = vi.fn();
    const stop = subscribeBodyModel(listener);
    expect(bodyModelConfig()).toEqual({});
    expect(setBodyModel("cerebras:qwen-3.8-27b")).toBe(true);
    expect(currentBodyModel()).toBe("cerebras:qwen-3.8-27b");
    expect(bodyModelConfig()).toEqual({
      config: { default_model: "cerebras:qwen-3.8-27b" },
    });
    expect(listener).toHaveBeenCalledWith("cerebras:qwen-3.8-27b");
    stop();
  });
  it("keeps the previous choice when a new value is invalid", () => {
    setBodyModel("openai:gpt-5.6-luna");
    expect(setBodyModel("bad id")).toBe(false);
    expect(currentBodyModel()).toBe("openai:gpt-5.6-luna");
  });
});
