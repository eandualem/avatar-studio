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
    components: { llm_service: { primary_model: "openai:gpt-5.6-sol" } },
  },
};

describe("preflight", () => {
  it("fails with a start hint when the runtime is unreachable", async () => {
    const result = await preflight(
      env,
      fetcher({ "http://127.0.0.1:7100/health": new Error("ECONNREFUSED") }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      "assistant-runtime is not reachable at http://127.0.0.1:7100 (ECONNREFUSED). Start it first (see runtime/avatar-runtime.env), then run make dev again.",
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
        "http://127.0.0.1:7100/api/voice/status": {
          status: 200,
          body: { enabled: false, configured: true },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([
      "runtime http://127.0.0.1:7100: openai:gpt-5.6-sol, voice disabled",
      "Talk live will be refused until assistant-runtime is started with voice enabled (VOICE__ENABLED).",
    ]);
  });

  it("reports a fully working runtime in one line", async () => {
    const result = await preflight(
      env,
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7100/api/voice/status": {
          status: 200,
          body: { enabled: true, configured: true },
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual([
      "runtime http://127.0.0.1:7100: openai:gpt-5.6-sol, voice enabled",
    ]);
  });

  it("honours per-role overrides and probes voice on the voice address", async () => {
    const result = await preflight(
      { ...env, VOICE_RUNTIME_URL: "http://127.0.0.1:7115/" },
      fetcher({
        "http://127.0.0.1:7100/health": healthy,
        "http://127.0.0.1:7115/health": new Error("ECONNREFUSED"),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toBe(
      "text/body: runtime http://127.0.0.1:7100: openai:gpt-5.6-sol, voice not checked",
    );
    expect(result.lines[1]).toContain(
      "voice: assistant-runtime is not reachable at http://127.0.0.1:7115",
    );
  });
});
