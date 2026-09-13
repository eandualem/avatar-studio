import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/voice/[...path]/route";
import {
  observeVoiceEvents,
  voiceRequest,
  VoiceHttpError,
} from "@/lib/voice-http";
import { sendTurn, cancelTurn } from "@/lib/runtime";
import { restPose } from "@/lib/motion";
import type { MotionController } from "@/types/avatar";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });
describe("voice transport boundaries", () => {
  it("forwards streaming events immediately with the explicit replay cursor", async () => {
    vi.stubEnv("VOICE_RUNTIME_URL", "http://voice.local");
    let enqueue!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        enqueue = controller;
      },
    });
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const request = new NextRequest(
      "http://app.local/api/voice/calls/c1/events?after=72",
    );
    const response = await GET(request, params("calls", "c1", "events"));
    expect(fetch.mock.calls[0]).toEqual([
      "http://voice.local/api/voice/calls/c1/events?after=72",
      expect.objectContaining({ signal: request.signal }),
    ]);
    const reader = response.body!.getReader();
    enqueue.enqueue(new TextEncoder().encode("id: 73\ndata: {}\n\n"));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "id: 73",
    );
    enqueue.close();
    await reader.cancel();
  });
  it("rejects unrelated routes, cross-origin calls and invalid replay cursors before reaching the runtime", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await GET(
          new NextRequest("http://app.local/api/voice/admin"),
          params("admin"),
        )
      ).status,
    ).toBe(404);
    for (const origin of ["https://other.local", "null", "https://app.local"]) {
      expect(
        (
          await POST(
            new NextRequest("http://app.local/api/voice/calls", {
              method: "POST",
              headers: { origin },
            }),
            params("calls"),
          )
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await GET(
          new NextRequest(
            "http://app.local/api/voice/calls/c1/events?after=no",
          ),
          params("calls", "c1", "events"),
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves backend rejection status even when an upstream error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("temporarily down", { status: 503 })),
    );
    await expect(voiceRequest("status")).rejects.toEqual(
      expect.objectContaining({ status: 503 }),
    );
    await expect(voiceRequest("status")).rejects.toBeInstanceOf(VoiceHttpError);
  });
  it("reconnects at the last processed event and ignores replayed IDs", async () => {
    vi.useFakeTimers();
    const sources: FakeSource[] = [];
    class FakeSource {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      close = vi.fn();
      constructor(readonly url: string) {
        sources.push(this);
      }
      emit(id: number, data: unknown) {
        this.onmessage?.({
          lastEventId: String(id),
          data: JSON.stringify(data),
        } as MessageEvent);
      }
    }
    vi.stubGlobal("EventSource", FakeSource);
    const receive = vi.fn(),
      failed = vi.fn();
    const stop = observeVoiceEvents("calls/c1/events", receive, failed);
    sources[0].emit(7, { status: "active" });
    sources[0].onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sources[1].url).toBe("/api/voice/calls/c1/events?after=7");
    sources[1].emit(7, {});
    sources[1].emit(8, { status: "active" });
    expect(receive).toHaveBeenCalledTimes(2);
    sources[1].onerror?.();
    stop();
    await vi.runAllTimersAsync();
    expect(sources).toHaveLength(2);
    expect(failed).not.toHaveBeenCalled();
  });
  it("returns typed continuations to the voice runtime with bounded visible context", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ content: "Done" }),
    );
    vi.stubGlobal("fetch", fetch);
    const controller = {
      ready: () => true,
      pose: restPose,
    } as MotionController;
    const conversation = {
      id: "voice-session",
      title: "Live",
      mode: "voice" as const,
      messages: [
        {
          id: "spoken",
          role: "user" as const,
          source: "voice" as const,
          content: "Wave again",
        },
      ],
    };
    await sendTurn(conversation, controller, new AbortController().signal);
    expect(fetch.mock.calls[0][0]).toBe("/api/runtime/voice-chat");
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.host_context.view.data.recent_visible_messages).toEqual([
      { role: "user", content: "Wave again" },
    ]);
    await cancelTurn(conversation.id, conversation.mode);
    expect(fetch.mock.calls[1][0]).toBe("/api/runtime/voice-cancel");
  });
});
