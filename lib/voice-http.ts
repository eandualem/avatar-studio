export class VoiceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly allocationStatus: "rejected" | "unknown" = "unknown",
  ) {
    super(message);
  }
}
export async function voiceRequest(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`/api/voice/${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(path.endsWith("tool-result") ? 175000 : 50000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new VoiceHttpError(
      typeof result?.detail === "string"
        ? result.detail
        : "The live conversation request failed.",
      response.status,
      result?.allocation_status === "rejected" ? "rejected" : "unknown",
    );
  return result;
}

// EventSource handles SSE framing; explicit reconnect URLs carry the runtime cursor.
export function observeVoiceEvents(
  path: string,
  receive: (id: number, data: unknown) => void,
  failed: () => void,
) {
  let source: EventSource | undefined,
    cursor = 0,
    attempts = 0,
    stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    if (stopped) return;
    source = new EventSource(`/api/voice/${path}?after=${cursor}`);
    source.onmessage = (event) => {
      const id = Number(event.lastEventId);
      if (!Number.isSafeInteger(id) || id <= cursor) return;
      try {
        const data: unknown = JSON.parse(event.data);
        receive(id, data);
        cursor = id;
        attempts = 0;
      } catch {
        stopped = true;
        source?.close();
        failed();
      }
    };
    source.onerror = () => {
      source?.close();
      if (stopped) return;
      if (++attempts > 3) {
        stopped = true;
        failed();
        return;
      }
      retry = setTimeout(connect, 1000 * attempts);
    };
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    source?.close();
  };
}
