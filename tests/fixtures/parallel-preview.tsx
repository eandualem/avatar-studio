"use client";
// Synthetic transport fixture only. Loaded by a temporary preview route, never
// the production app. No microphone, peer connection, or provider allocation.
import { useEffect, useState } from "react";
import Studio from "@/components/Studio";
import { motionExamples } from "@/lib/motion-lab";

export default function ParallelPreview() {
  const [say, setSay] = useState<((text: string) => void) | null>(null);
  const [receipts, setReceipts] = useState<string[]>([]);
  const [realBody, setRealBody] = useState(false);
  useEffect(() => {
    const originalFetch = window.fetch;
    const originalPeer = window.RTCPeerConnection;
    const originalEvents = window.EventSource;
    const originalAudio = window.Audio;
    const originalContext = window.AudioContext;
    const originalMedia = Object.getOwnPropertyDescriptor(
      navigator,
      "mediaDevices",
    );
    let callId = crypto.randomUUID(),
      cursor = 0,
      time = 0;
    let source: FakeSource | undefined;
    const emit = (event: string, data: unknown) =>
      source?.onmessage?.({
        lastEventId: String(++cursor),
        data: JSON.stringify({ type: "voice", call_id: callId, event, data }),
      } as MessageEvent);
    class FakeChannel extends EventTarget {
      readyState = "open";
      onmessage: ((event: MessageEvent) => void) | null = null;
      emit(data: unknown) {
        const event = new MessageEvent("message", {
          data: JSON.stringify(data),
        });
        this.onmessage?.(event);
        this.dispatchEvent(event);
      }
      send(raw: string) {
        const value = JSON.parse(raw);
        this.emit({
          type: value.type.replace(/append$/, "appended"),
          client_event_id: value.event_id,
        });
      }
    }
    class FakePeer extends EventTarget {
      connectionState = "new";
      iceGatheringState = "complete";
      localDescription: RTCSessionDescriptionInit | null = null;
      onconnectionstatechange: (() => void) | null = null;
      channel = new FakeChannel();
      addTrack() {}
      createDataChannel() {
        return this.channel;
      }
      async createOffer() {
        return { type: "offer", sdp: "synthetic-no-provider" };
      }
      async setLocalDescription(sdp: RTCSessionDescriptionInit) {
        this.localDescription = sdp;
      }
      async setRemoteDescription() {
        this.connectionState = "connected";
        this.onconnectionstatechange?.();
        this.dispatchEvent(new Event("connectionstatechange"));
        this.channel.emit({ type: "session.started" });
      }
      close() {
        this.connectionState = "closed";
      }
    }
    class FakeSource {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        // Retain the synthetic event source so the fixture controls can emit SSE.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        source = this;
      }
      close() {
        if (source === this) source = undefined;
      }
    }
    class FakeAudio {
      autoplay = false;
      muted = false;
      paused = true;
      async play() {
        this.paused = false;
      }
      pause() {
        this.paused = true;
      }
    }
    class FakeContext {
      async resume() {}
      async close() {}
    }
    const track = Object.assign(new EventTarget(), {
      enabled: false,
      stop() {},
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          return { getTracks: () => [track], getAudioTracks: () => [track] };
        },
      },
    });
    window.RTCPeerConnection = FakePeer as unknown as typeof RTCPeerConnection;
    window.EventSource = FakeSource as unknown as typeof EventSource;
    window.Audio = FakeAudio as unknown as typeof Audio;
    window.AudioContext = FakeContext as unknown as typeof AudioContext;
    window.fetch = async (url, init) => {
      const path = String(url);
      if (path.startsWith("/api/voice/")) {
        if (path.endsWith("/status"))
          return Response.json({
            enabled: true,
            configured: true,
            conversation_mode_supported: true,
          });
        if (path.endsWith("/calls")) {
          callId = crypto.randomUUID();
          cursor = 0;
          return Response.json({
            call_id: callId,
            session_id: "fixture",
            mode: "conversation",
            transport: { type: "webrtc", sdp: "synthetic-answer" },
          });
        }
        return Response.json({ finalized: true });
      }
      if (path.startsWith("/api/runtime/body-")) {
        const body = JSON.parse(String(init?.body));
        if (body.tool_call_id)
          setReceipts((old) =>
            [...old, JSON.stringify(body.tool_result)].slice(-5),
          );
        if (realBody) return originalFetch(url, init);
        if (path.endsWith("cancel")) return Response.json({ canceled: true });
        if (body.tool_call_id)
          return Response.json({ content: null, decision: "completed" });
        const text =
          body.host_context.view.data.conversation.at(-1)?.content || "";
        await new Promise((resolve) => setTimeout(resolve, 500));
        const run = /run/i.test(text),
          explicit = /run|wave/i.test(text);
        const example = run
          ? motionExamples.find((e) => e.name === "Run in place")!
          : motionExamples.find((e) => e.name === "Small wave")!;
        return Response.json({
          content: null,
          decision: "pending",
          pending_tool_call: {
            tool_name: "move_avatar",
            call_id: crypto.randomUUID(),
            arguments: {
              ...example.motion,
              ...(run ? { repeat: 8 } : {}),
              intent: explicit ? "explicit" : "incidental",
              label: run ? "running in place" : "wave",
            },
          },
        });
      }
      return originalFetch(url, init);
    };
    setSay(() => (text: string) => {
      time += 4000;
      emit("transcript", {
        role: "user",
        delta: text,
        start_ms: time,
        end_ms: time + 600,
      });
      setTimeout(
        () =>
          emit("transcript", {
            role: "assistant",
            delta: "Sure, let's keep talking.",
            start_ms: time + 700,
            end_ms: time + 1200,
          }),
        80,
      );
    });
    return () => {
      window.fetch = originalFetch;
      window.RTCPeerConnection = originalPeer;
      window.EventSource = originalEvents;
      window.Audio = originalAudio;
      window.AudioContext = originalContext;
      if (originalMedia)
        Object.defineProperty(navigator, "mediaDevices", originalMedia);
      else Reflect.deleteProperty(navigator, "mediaDevices");
    };
  }, [realBody]);
  return (
    <>
      <Studio />
      <aside
        style={{
          position: "fixed",
          left: 8,
          bottom: 8,
          zIndex: 99,
          background: "#fff9ed",
          padding: 12,
          maxWidth: 245,
          fontSize: 12,
        }}
      >
        <strong>Synthetic voice — no microphone or paid Live</strong>
        <p>
          <label>
            <input
              type="checkbox"
              checked={realBody}
              onChange={(e) => setRealBody(e.target.checked)}
            />{" "}
            Subscription body (new call only)
          </label>
        </p>
        <button onClick={() => say?.("Hello!")}>Inject hello</button>{" "}
        <button onClick={() => say?.("Run in place for eight cycles.")}>
          Inject run
        </button>{" "}
        <button onClick={() => say?.("Tell me a joke.")}>
          Inject conversation
        </button>{" "}
        <button onClick={() => say?.("Stop moving!")}>Inject stop</button>
        <details>
          <summary>Engine receipts ({receipts.length})</summary>
          <pre
            style={{ maxHeight: 150, overflow: "auto", whiteSpace: "pre-wrap" }}
          >
            {receipts.join("\n")}
          </pre>
        </details>
      </aside>
    </>
  );
}
