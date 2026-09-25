import { describe, expect, it } from "vitest";
import { preflight } from "../scripts/preflight";

type Route = { status: number; body?: unknown } | Error;

function fetcher(routes: Record<string, Route>) {
  return async (url: string) => {
    const route = routes[url];
    if (!route) throw new Error(`unexpected ${url}`);
    if (route instanceof Error) throw route;
    return { status: route.status, json: async () => route.body ?? {} };
  };
}

const env = { RUNTIME_URL: "http://127.0.0.1:7100" };
const healthy = {
  status: 200,
  body: {
    healthy: true,
    components: { llm_service: { primary_model: "openai:gpt-5.6-terra" } },
  },
};
const profiles = (...available: string[]) => ({
  status: 200,
  body: { available_profiles: available },
});
const registered = profiles("design_studio", "avatar_studio");
const appModels =
  "app models: text openai:gpt-5.6-sol, body openai:gpt-6-astra, auxiliary openai:gpt-5.6-luna";

describe("preflight", () => {
  it("fails with a start hint when the runtime is unreachable", async () => {
    const result = await preflight(
      env,
      fetcher({ "http://127.0.0.1:7100/health": new Error("ECONNREFUSED") }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      "assistant-runtime is not reachable at http://127.0.0.1:7100 (ECONNREFUSED). Start it first (see docs/single-runtime.md), then run make dev again.",
    ]);
  });

  it("distinguishes an auth rejection from an outage", async () => {
    const result = await preflight(
      env,
      fetcher({ "http://127.0.0.1:7100/health": { status: 401 } }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      "assistant-runtime at http://127.0.0.1:7100 rejected the request (HTTP 401): check ACCESS__LOCAL_TOKEN",
    ]);
  });

  it("fails and names the components when the runtime reports unhealthy", async () => {
    const result = await preflight(
      env,
      fetcher({
        "http://127.0.0.1:7100/health": {
          status: 200,
          body: {
            healthy: false,
            components: {
              llm_service: { healthy: false },
              access_service: { healthy: true },
            },
          },
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      "assistant-runtime at http://127.0.0.1:7100 reports unhealthy: llm_service",
    ]);
  });

  it("passes with a warning when voice is disabled", async () => {
    const result = await preflight(
      env,
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/artifacts/profile": registered,
        "http://127.0.0.1:7100/api/voice/status": {
          status: 200,
          body: { enabled: false, configured: true },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([
      "runtime http://127.0.0.1:7100: default model openai:gpt-5.6-terra, voice disabled",
      "Talk live will be refused until assistant-runtime is started with voice enabled (VOICE__ENABLED).",
      appModels,
    ]);
  });

  it("reports a fully working runtime and the models the app sends", async () => {
    const result = await preflight(
      env,
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/artifacts/profile": registered,
        "http://127.0.0.1:7100/api/voice/status": {
          status: 200,
          body: {
            enabled: true,
            configured: true,
            call_instructions_supported: true,
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([
      "runtime http://127.0.0.1:7100: default model openai:gpt-5.6-terra, voice enabled",
      appModels,
    ]);
  });

  it("honours per-role overrides and probes voice on the voice address", async () => {
    const result = await preflight(
      { ...env, VOICE_RUNTIME_URL: "http://127.0.0.1:7115/" },
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/artifacts/profile": registered,
        "http://127.0.0.1:7115/health": new Error("ECONNREFUSED"),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toBe(
      "text/body: runtime http://127.0.0.1:7100: default model openai:gpt-5.6-terra, voice not checked",
    );
    expect(result.lines[1]).toContain(
      "voice: assistant-runtime is not reachable at http://127.0.0.1:7115",
    );
  });

  it("fails when the avatar_studio profile is not registered", async () => {
    const result = await preflight(
      env,
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/artifacts/profile":
          profiles("design_studio"),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      "assistant-runtime at http://127.0.0.1:7100 has no 'avatar_studio' profile registered (available: design_studio). Add this repository's profiles/avatar-studio.toml to ASSISTANT__PROFILES and restart it.",
    ]);
  });

  it("fails on a runtime without a profile registry", async () => {
    const result = await preflight(
      env,
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/artifacts/profile": { status: 404 },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      "assistant-runtime at http://127.0.0.1:7100 has no profile registry (GET /api/artifacts/profile). Update assistant-runtime, register profiles/avatar-studio.toml in ASSISTANT__PROFILES and restart it.",
    ]);
  });

  it("starts, but says Talk live is refused, when calls cannot carry instructions", async () => {
    const result = await preflight(
      env,
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/artifacts/profile": registered,
        "http://127.0.0.1:7100/api/voice/status": {
          status: 200,
          body: { enabled: true, configured: true },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([
      "runtime http://127.0.0.1:7100: default model openai:gpt-5.6-terra, voice enabled, but without per-call instructions",
      "Talk live will be refused: update assistant-runtime so calls can carry Charlie’s persona (call_instructions_supported).",
      appModels,
    ]);
  });

  it("prints the app's model overrides", async () => {
    const result = await preflight(
      {
        ...env,
        TEXT_MODEL: "cerebras:qwen-3.8-27b",
        BODY_MODEL: "cerebras:gpt-oss-120b",
        AUXILIARY_MODEL: "openai:gpt-5.6-terra",
      },
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/artifacts/profile": registered,
        "http://127.0.0.1:7100/api/voice/status": { status: 200, body: {} },
      }),
    );
    expect(result.lines.at(-1)).toBe(
      "app models: text cerebras:qwen-3.8-27b, body cerebras:gpt-oss-120b, auxiliary openai:gpt-5.6-terra",
    );
  });
});
