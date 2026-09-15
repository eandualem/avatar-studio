import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Minimal dotenv reader: KEY=value lines, double-quoted values with \n and \" escapes. */
function parseEnv(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    values[key] =
      raw.startsWith('"') && raw.endsWith('"')
        ? raw
            .slice(1, -1)
            .replace(/\\(["\\n])/g, (_, c: string) => (c === "n" ? "\n" : c))
        : raw;
  }
  return values;
}

describe("runtime/avatar-runtime.env", () => {
  const env = parseEnv(readFileSync("runtime/avatar-runtime.env", "utf8"));

  it("holds no credentials", () => {
    for (const key of Object.keys(env))
      expect(key, key).not.toMatch(/API_KEY|ENCRYPTION_KEY|SECRET|TOKEN/);
  });

  it("keeps the voice prompt identical to profiles/live-instructions.md", () => {
    expect(env.VOICE__CONVERSATION_INSTRUCTIONS).toBe(
      readFileSync("profiles/live-instructions.md", "utf8").trim(),
    );
  });

  it("configures a conversation-only, Codex-only shared instance", () => {
    expect(env).toMatchObject({
      LLM__CODEX_ONLY: "true",
      VOICE__ENABLED: "true",
      VOICE__DELEGATION_ENABLED: "false",
      ASSISTANT__ENABLE_WORKING_MEMORY: "false",
    });
    expect(env.ASSISTANT__PROFILE).toMatch(/profiles\/avatar-studio\.toml$/);
    expect(env.LLM__CODEX_SERVICE_TIER).toBeUndefined();
  });
});
