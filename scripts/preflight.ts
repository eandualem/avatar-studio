/**
 * `make dev` preflight: report whether the configured assistant-runtime is
 * reachable before the app starts. The runtime is started separately; this
 * never starts, replaces or stops it. Bun loads .env/.env.local, so the same
 * RUNTIME_URL (and VOICE_RUNTIME_URL/BODY_RUNTIME_URL overrides) the app
 * server uses are checked here.
 */
import { APP_PROFILE, runtimeUrl } from "../lib/runtime-config";

export type PreflightResult = { ok: boolean; lines: string[] };

type Fetch = (
  url: string,
) => Promise<{ status: number; json(): Promise<unknown> }>;

// Wording shared with design-studio so both apps report the runtime alike.
const START_HINT =
  "Start it first (see docs/single-runtime.md), then run make dev again.";

type Probe =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "unreachable" | "auth" | "error"; detail: string };

async function probe(fetcher: Fetch, url: string): Promise<Probe> {
  try {
    const response = await fetcher(url);
    if (response.status === 401 || response.status === 403)
      return { kind: "auth", detail: `HTTP ${response.status}` };
    if (response.status < 200 || response.status >= 300)
      return { kind: "error", detail: `HTTP ${response.status}` };
    const body = await response.json().catch(() => ({}));
    return { kind: "ok", body: (body ?? {}) as Record<string, unknown> };
  } catch (error) {
    return {
      kind: "unreachable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function unhealthyComponents(health: Record<string, unknown>) {
  const components = health.components;
  if (!components || typeof components !== "object") return [];
  return Object.entries(components as Record<string, { healthy?: unknown }>)
    .filter(([, value]) => value?.healthy === false)
    .map(([name]) => name);
}

function primaryModel(health: Record<string, unknown>) {
  const llm = (
    health.components as Record<string, Record<string, unknown>> | undefined
  )?.llm_service;
  return typeof llm?.primary_model === "string"
    ? llm.primary_model
    : "unknown model";
}

export async function preflight(
  env: Record<string, string | undefined> = process.env,
  fetcher: Fetch = (url) => fetch(url, { signal: AbortSignal.timeout(3000) }),
): Promise<PreflightResult> {
  const lines: string[] = [];
  let ok = true;
  // One instance normally serves every role; only probe each address once.
  const addresses = new Map<string, string[]>();
  for (const role of ["text", "body", "voice"] as const) {
    const url = runtimeUrl(role, env);
    addresses.set(url, [...(addresses.get(url) ?? []), role]);
  }
  for (const [url, roles] of addresses) {
    const prefix = addresses.size > 1 ? `${roles.join("/")}: ` : "";
    const health = await probe(fetcher, `${url}/health`);
    if (health.kind !== "ok") {
      ok = false;
      lines.push(
        health.kind === "unreachable"
          ? `${prefix}assistant-runtime is not reachable at ${url} (${health.detail}). ${START_HINT}`
          : health.kind === "auth"
            ? `${prefix}assistant-runtime at ${url} rejected the request (${health.detail}): check ACCESS__LOCAL_TOKEN`
            : `${prefix}assistant-runtime at ${url} answered /health with ${health.detail}.`,
      );
      continue;
    }
    if (health.body.healthy === false) {
      ok = false;
      lines.push(
        `${prefix}assistant-runtime at ${url} reports unhealthy: ${unhealthyComponents(health.body).join(", ") || "no component named"}`,
      );
      continue;
    }
    if (roles.includes("text") || roles.includes("body")) {
      // Unknown profiles are refused per request (chat 409, voice 422), so a
      // runtime without ours registered cannot serve Charlie at all.
      const profiles = await probe(fetcher, `${url}/api/artifacts/profile`);
      const available =
        profiles.kind === "ok" &&
        Array.isArray(profiles.body.available_profiles)
          ? (profiles.body.available_profiles as unknown[])
          : undefined;
      if (available && !available.includes(APP_PROFILE)) {
        ok = false;
        lines.push(
          `${prefix}assistant-runtime at ${url} has no '${APP_PROFILE}' profile registered (available: ${available.join(", ") || "none"}). Add this repository's profiles/avatar-studio.toml to ASSISTANT__PROFILES and restart it.`,
        );
        continue;
      }
      if (!available) {
        // A runtime without registered profiles would answer with its
        // global persona instead of Charlie; the shared workflow needs the API.
        ok = false;
        lines.push(
          `${prefix}assistant-runtime at ${url} has no profile registry (GET /api/artifacts/profile). Update assistant-runtime, register profiles/avatar-studio.toml in ASSISTANT__PROFILES and restart it.`,
        );
        continue;
      }
    }
    // The expression loop asks the runtime's decisions on every transcript
    // fragment; without them Charlie's body stays idle during a call.
    let decisions = "not checked";
    if (roles.includes("text")) {
      const status = await probe(fetcher, `${url}/api/decisions/status`);
      if (status.kind !== "ok") decisions = `unavailable (${status.detail})`;
      else if (status.body.configured !== true) decisions = "not configured";
      else decisions = "configured";
    }
    let voice = "not checked";
    if (roles.includes("voice")) {
      const status = await probe(fetcher, `${url}/api/voice/status`);
      if (status.kind !== "ok") voice = `status unavailable (${status.detail})`;
      else if (status.body.enabled !== true) voice = "disabled";
      else if (status.body.configured !== true)
        voice = "enabled, not configured";
      else if (status.body.call_instructions_supported !== true)
        voice = "enabled, but without per-call instructions";
      else voice = "enabled";
    }
    lines.push(
      `${prefix}runtime ${url}: ${primaryModel(health.body)}, voice ${voice}, decisions ${decisions}`,
    );
    if (decisions === "not configured")
      lines.push(
        "Charlie's body will stay idle during Talk live until assistant-runtime has TYPESAFE_API_KEY (typed decisions).",
      );
    else if (decisions.startsWith("unavailable"))
      lines.push(
        "Charlie's body will stay idle during Talk live: update assistant-runtime to 0.3.0 (typed decisions).",
      );
    // Voice is optional: text and body work without it, Talk live is refused.
    if (voice === "disabled")
      lines.push(
        "Talk live will be refused until assistant-runtime is started with voice enabled (VOICE__ENABLED).",
      );
    else if (voice.endsWith("per-call instructions"))
      lines.push(
        "Talk live will be refused: update assistant-runtime so calls can carry Charlie’s persona (call_instructions_supported).",
      );
  }
  return { ok, lines };
}

if (import.meta.main) {
  const result = await preflight();
  for (const line of result.lines) console.log(line);
  process.exit(result.ok ? 0 : 1);
}
