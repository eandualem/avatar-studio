import { describe, expect, it } from "vitest";
import {
  DEFAULT_BODY_MODEL,
  DEFAULT_BODY_THINKING_BUDGET,
  runtimeUrl,
  withBodyConfig,
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
  it("selects the body model and budget on a shared instance", () => {
    expect(withBodyConfig({ content: "x" }, {})).toEqual({
      content: "x",
      config: {
        default_model: DEFAULT_BODY_MODEL,
        thinking_budget: DEFAULT_BODY_THINKING_BUDGET,
      },
    });
  });

  it("reads BODY_MODEL and BODY_THINKING_BUDGET, ignoring invalid budgets", () => {
    expect(
      withBodyConfig(
        {},
        { BODY_MODEL: "openai:gpt-5.6-sol", BODY_THINKING_BUDGET: "2000" },
      ).config,
    ).toEqual({ default_model: "openai:gpt-5.6-sol", thinking_budget: 2000 });
    expect(withBodyConfig({}, { BODY_THINKING_BUDGET: "-3" }).config).toEqual({
      default_model: DEFAULT_BODY_MODEL,
      thinking_budget: DEFAULT_BODY_THINKING_BUDGET,
    });
  });

  it("never overwrites config a caller supplied", () => {
    expect(
      withBodyConfig({ config: { default_model: "openai:custom" } }, {}).config,
    ).toEqual({
      default_model: "openai:custom",
      thinking_budget: DEFAULT_BODY_THINKING_BUDGET,
    });
  });
});
