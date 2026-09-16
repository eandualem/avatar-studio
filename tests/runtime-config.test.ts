import { describe, expect, it } from "vitest";
import {
  APP_PROFILE,
  DEFAULT_AUXILIARY_MODEL,
  DEFAULT_BODY_MODEL,
  DEFAULT_TEXT_MODEL,
  DEFAULT_THINKING_BUDGET,
  runtimeUrl,
  withBodyConfig,
  withTextConfig,
} from "@/lib/runtime-config";

describe("runtimeUrl", () => {
  it("serves every role from RUNTIME_URL by default", () => {
    const env = { RUNTIME_URL: "http://runtime.local:7100/" };
    expect(runtimeUrl("text", env)).toBe("http://runtime.local:7100");
    expect(runtimeUrl("body", env)).toBe("http://runtime.local:7100");
    expect(runtimeUrl("voice", env)).toBe("http://runtime.local:7100");
    expect(runtimeUrl("voice", {})).toBe("http://127.0.0.1:7100");
  });

  it("honours optional per-role overrides", () => {
    const env = {
      RUNTIME_URL: "http://one",
      BODY_RUNTIME_URL: "http://body",
      VOICE_RUNTIME_URL: "http://voice/",
    };
    expect(runtimeUrl("text", env)).toBe("http://one");
    expect(runtimeUrl("body", env)).toBe("http://body");
    expect(runtimeUrl("voice", env)).toBe("http://voice");
  });
});

describe("withBodyConfig", () => {
  it("selects the profile, body model and budget on a shared instance", () => {
    expect(withBodyConfig({ content: "x" }, {})).toEqual({
      content: "x",
      profile: APP_PROFILE,
      config: {
        default_model: DEFAULT_BODY_MODEL,
        thinking_budget: DEFAULT_THINKING_BUDGET,
        enable_working_memory: false,
        summarization_model: DEFAULT_AUXILIARY_MODEL,
        working_memory_model: DEFAULT_AUXILIARY_MODEL,
      },
    });
  });

  it("reads BODY_MODEL and BODY_THINKING_BUDGET, ignoring invalid budgets", () => {
    expect(
      withBodyConfig(
        {},
        { BODY_MODEL: "openai:gpt-5.6-sol", BODY_THINKING_BUDGET: "2000" },
      ).config,
    ).toMatchObject({
      default_model: "openai:gpt-5.6-sol",
      thinking_budget: 2000,
    });
    expect(
      withBodyConfig({}, { BODY_THINKING_BUDGET: "-3" }).config,
    ).toMatchObject({
      default_model: DEFAULT_BODY_MODEL,
      thinking_budget: DEFAULT_THINKING_BUDGET,
    });
  });

  it("never overwrites config or profile a caller supplied", () => {
    const result = withBodyConfig(
      { profile: "other", config: { default_model: "openai:custom" } },
      {},
    );
    expect(result.profile).toBe("other");
    expect(result.config).toMatchObject({
      default_model: "openai:custom",
      thinking_budget: DEFAULT_THINKING_BUDGET,
      enable_working_memory: false,
    });
  });
});

describe("withTextConfig", () => {
  it("keeps text on Sol with the profile and working memory off", () => {
    expect(withTextConfig({ content: "hi" }, {})).toEqual({
      content: "hi",
      profile: APP_PROFILE,
      config: {
        default_model: DEFAULT_TEXT_MODEL,
        thinking_budget: DEFAULT_THINKING_BUDGET,
        enable_working_memory: false,
        summarization_model: DEFAULT_AUXILIARY_MODEL,
        working_memory_model: DEFAULT_AUXILIARY_MODEL,
      },
    });
  });

  it("sends the auxiliary model from AUXILIARY_MODEL", () => {
    expect(
      withTextConfig({}, { AUXILIARY_MODEL: "openai:gpt-5.6-sol" }).config,
    ).toMatchObject({
      summarization_model: "openai:gpt-5.6-sol",
      working_memory_model: "openai:gpt-5.6-sol",
    });
  });

  it("reads TEXT_MODEL and TEXT_THINKING_BUDGET", () => {
    expect(
      withTextConfig(
        {},
        { TEXT_MODEL: "cerebras:gpt-oss-120b", TEXT_THINKING_BUDGET: "800" },
      ).config,
    ).toMatchObject({
      default_model: "cerebras:gpt-oss-120b",
      thinking_budget: 800,
    });
  });
});
