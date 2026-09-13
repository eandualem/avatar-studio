import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor, waitFor, type ActorRefFrom } from "xstate";
import type { voiceMachine } from "@/machines/voiceMachine";
import { VoiceClient } from "@/lib/voice-client";
import { conversationMachine } from "@/machines/conversationMachine";
import { restPose } from "@/lib/motion";
import type { MotionController, MotionResult } from "@/types/avatar";
import { voiceRequest, observeVoiceEvents } from "@/lib/voice-http";

vi.mock("@/lib/voice-http", () => ({
  voiceRequest: vi.fn(),
  observeVoiceEvents: vi.fn(() => vi.fn()),
  VoiceHttpError: class extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
}));
const callId = "c3a45b02-ab96-43be-9d0f-2b9e449b96fb";
const offer = {
  call_id: callId,
  session_id: "session",
  transport: { type: "webrtc", sdp: "answer" },
};
const completed: MotionResult = {
  status: "completed",
  pose: restPose(),
  duration: 1,
  constrained: false,
};
const pending = {
  tool_name: "move_avatar",
  call_id: "hand",
  arguments: {
    waypoints: [{ time: 1, left: { position: [0.29, 0.83, 0.07] } }],
  },
};
const event = (event: string, data: Record<string, unknown>) => ({
  type: "voice",
  call_id: callId,
  event,
  data,
});
const track = () =>
  Object.assign(new EventTarget(), { enabled: true, stop: vi.fn() });
let mic: ReturnType<typeof track>,
  media: {
    getTracks: () => (typeof mic)[];
    getAudioTracks: () => (typeof mic)[];
  },
  getUserMedia: ReturnType<typeof vi.fn>;
let peers: FakePeer[];
class FakeChannel extends EventTarget {
  onmessage: ((event: MessageEvent) => void) | null = null;
  emit(data: unknown) {
    const e = new MessageEvent("message", { data: JSON.stringify(data) });
    this.onmessage?.(e);
    this.dispatchEvent(e);
  }
}
class FakePeer extends EventTarget {
  connectionState = "new";
  iceGatheringState = "complete";
  localDescription: RTCSessionDescriptionInit | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  channel = new FakeChannel();
  close = vi.fn(() => {
    this.connectionState = "closed";
    this.onconnectionstatechange?.();
  });
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "offer" }));
  setLocalDescription = vi.fn(async (sdp: RTCSessionDescriptionInit) => {
    this.localDescription = sdp;
  });
  setRemoteDescription = vi.fn(async () => {
    this.connectionState = "connected";
    this.onconnectionstatechange?.();
    this.dispatchEvent(new Event("connectionstatechange"));
    this.channel.emit({ type: "session.started" });
  });
  constructor() {
    super();
    peers.push(this);
  }
}
class FakeAudio {
  autoplay = false;
  muted = false;
  paused = true;
  srcObject: unknown = null;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
}
class FakeAudioContext {
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}
function controller(): MotionController {
  return {
    ready: () => true,
    pose: restPose,
    attach: vi.fn(),
    detach: vi.fn(),
    stop: vi.fn(),
    execute: vi.fn(async () => completed),
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  vi.clearAllMocks();
  peers = [];
  mic = track();
  media = { getTracks: () => [mic], getAudioTracks: () => [mic] };
  getUserMedia = vi.fn(async () => media);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.mocked(voiceRequest).mockImplementation(async (path) => {
    if (path === "status") return { enabled: true, configured: true };
    if (path === "calls") return offer;
    if (path.endsWith("/close")) return { status: "closed", finalized: true };
    return { accepted: true };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("live audio lifecycle and delegated motion", () => {
  it("checks configuration before requesting microphone access", async () => {
    vi.mocked(voiceRequest).mockResolvedValueOnce({
      enabled: true,
      configured: false,
    });
    const client = new VoiceClient("session", controller());
    await expect(client.start()).rejects.toThrow("OpenAI API key");
    expect(getUserMedia).not.toHaveBeenCalled();
    await client.end();
  });
  it("negotiates with handlers installed, mutes tracks and closes the provider before disposing media", async () => {
    const client = new VoiceClient("session", controller());
    await client.start();
    expect(peers[0].createDataChannel).toHaveBeenCalledWith("oai-events");
    expect(voiceRequest).toHaveBeenCalledWith(
      "calls",
      "POST",
      expect.objectContaining({ sdp: "offer", session_id: "session" }),
    );
    client.toggleMic();
    expect(mic.enabled).toBe(false);
    expect(client.snapshot().micMuted).toBe(true);
    client.toggleMic();
    expect(mic.enabled).toBe(true);
    vi.mocked(voiceRequest).mockImplementationOnce(async () => {
      expect(mic.stop).not.toHaveBeenCalled();
      return { finalized: true };
    });
    await client.end();
    await client.end();
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(
      vi
        .mocked(voiceRequest)
        .mock.calls.filter(([path]) => path.endsWith("/close")),
    ).toHaveLength(1);
  });
  it("releases microphone access that resolves after cancellation", async () => {
    let grant!: (value: typeof media) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        grant = resolve;
      }),
    );
    const client = new VoiceClient("session", controller());
    const start = client.start().catch((error) => error);
    await flush();
    await client.end();
    grant(media);
    await start;
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(peers).toHaveLength(0);
  });
  it("closes a call allocated after the user has already cancelled setup", async () => {
    let allocate!: (value: typeof offer) => void;
    vi.mocked(voiceRequest).mockImplementation(async (path) =>
      path === "status"
        ? { enabled: true, configured: true }
        : path === "calls"
          ? new Promise((resolve) => {
              allocate = resolve;
            })
          : { finalized: true },
    );
    const client = new VoiceClient("session", controller());
    const start = client.start().catch((error) => error);
    await flush();
    const end = client.end();
    allocate(offer);
    await Promise.all([start, end]);
    expect(voiceRequest).toHaveBeenCalledWith(`calls/${callId}/close`, "POST");
    expect(mic.stop).toHaveBeenCalledOnce();
  });
  it("executes only pending_host, deduplicates replay, and uses the voice result endpoint", async () => {
    const body = controller(),
      client = new VoiceClient("session", body);
    await client.start();
    client.receive(
      event("backend", {
        delegation_id: "d1",
        event: {
          type: "final_response",
          content: "Working",
          pending_tool_call: pending,
        },
      }),
    );
    expect(body.execute).not.toHaveBeenCalled();
    const handoff = event("delegation", {
      id: "d1",
      status: "pending_host",
      pending_tool_call: pending,
    });
    client.receive(handoff);
    client.receive(handoff);
    await flush();
    expect(body.execute).toHaveBeenCalledOnce();
    expect(voiceRequest).toHaveBeenCalledWith(
      `calls/${callId}/context`,
      "PATCH",
      expect.any(Object),
    );
    expect(voiceRequest).toHaveBeenCalledWith(
      `calls/${callId}/delegations/d1/tool-result`,
      "POST",
      { tool_call_id: "hand", tool_result: completed, tool_outcome: "success" },
    );
    await client.end();
  });
  it.each(["delegation", "snapshot"])(
    "aborts superseded motion from %s without submitting a stale result",
    async (source) => {
      const body = controller();
      vi.mocked(body.execute).mockImplementation(
        (_motion, signal) =>
          new Promise((resolve) =>
            signal?.addEventListener("abort", () =>
              resolve({ ...completed, status: "interrupted" }),
            ),
          ),
      );
      const client = new VoiceClient("session", body);
      await client.start();
      client.receive(
        event("delegation", {
          id: "d1",
          status: "pending_host",
          pending_tool_call: pending,
        }),
      );
      client.receive(
        source === "delegation"
          ? event("delegation", { id: "d1", status: "superseded" })
          : event("snapshot", {
              status: "active",
              transcript: [],
              active_delegation: "d1",
              delegations: { d1: { status: "cancelled" } },
            }),
      );
      expect(vi.mocked(body.execute).mock.calls[0][1]?.aborted).toBe(true);
      await flush();
      expect(
        vi
          .mocked(voiceRequest)
          .mock.calls.some(([path]) => path.endsWith("tool-result")),
      ).toBe(false);
      await client.end();
    },
  );
  it("does not repeat a physical action after a lost result acknowledgement", async () => {
    const body = controller(),
      client = new VoiceClient("session", body);
    await client.start();
    vi.mocked(voiceRequest).mockImplementation(async (path) => {
      if (path.endsWith("tool-result")) throw new Error("connection lost");
      if (path === `calls/${callId}`)
        return {
          status: "active",
          transcript: [],
          active_delegation: "d1",
          delegations: { d1: { status: "pending_host" } },
          pending_tool_call: pending,
        };
      return { finalized: true };
    });
    client.receive(
      event("delegation", {
        id: "d1",
        status: "pending_host",
        pending_tool_call: pending,
      }),
    );
    await flush();
    expect(body.execute).toHaveBeenCalledOnce();
    expect(client.snapshot().warning).toContain("not be repeated");
    await client.end();
  });
  it("reconciles transcript snapshots and ignores historical cancelled actions", async () => {
    const body = controller(),
      client = new VoiceClient("session", body);
    await client.start();
    client.receive(
      event("transcript", {
        role: "user",
        delta: "Hello",
        start_ms: 0,
        end_ms: 300,
      }),
    );
    client.receive(
      event("snapshot", {
        status: "active",
        transcript: [
          { role: "user", delta: "Hello", start_ms: 0, end_ms: 300 },
          { role: "assistant", delta: "Hi!", start_ms: 400, end_ms: 600 },
        ],
        active_delegation: "d1",
        delegations: { d1: { status: "cancelled" } },
        pending_tool_call: pending,
      }),
    );
    expect(client.snapshot().messages.map((m) => m.content)).toEqual([
      "Hello",
      "Hi!",
    ]);
    expect(body.execute).not.toHaveBeenCalled();
    await client.end();
  });
  it("stops media even when provider closure is unconfirmed", async () => {
    const client = new VoiceClient("session", controller());
    await client.start();
    vi.mocked(voiceRequest).mockResolvedValueOnce({ finalized: false });
    await expect(client.end()).rejects.toThrow("did not confirm");
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
  });
  it("closes an allocated call when its answer is malformed", async () => {
    vi.mocked(voiceRequest).mockImplementation(async (path) =>
      path === "status"
        ? { enabled: true, configured: true }
        : path === "calls"
          ? { call_id: callId, transport: { sdp: "" } }
          : { finalized: true },
    );
    const client = new VoiceClient("session", controller());
    await expect(client.start()).rejects.toThrow();
    await client.end();
    expect(voiceRequest).toHaveBeenCalledWith(`calls/${callId}/close`, "POST");
    expect(mic.stop).toHaveBeenCalledOnce();
  });
  it("still awaits runtime closure after a finalized usage event", async () => {
    const client = new VoiceClient("session", controller());
    await client.start();
    client.receive(event("usage", { finalized: true }));
    await client.end();
    expect(voiceRequest).toHaveBeenCalledWith(`calls/${callId}/close`, "POST");
  });
  it("does not execute a late handoff while cancellation is draining", async () => {
    const body = controller(),
      client = new VoiceClient("session", body);
    await client.start();
    let finish!: (value: unknown) => void;
    vi.mocked(voiceRequest).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const cancelled = client.cancelWork();
    client.receive(
      event("delegation", {
        id: "d1",
        status: "pending_host",
        pending_tool_call: pending,
      }),
    );
    expect(body.execute).not.toHaveBeenCalled();
    finish({ accepted: true });
    await cancelled;
    await client.end();
  });
  it("releases the call when the owning app actor is stopped", async () => {
    const actor = createActor(conversationMachine, {
      input: { controller: controller() },
    }).start();
    await waitFor(actor, (s) => s.matches("idle"));
    actor.send({ type: "START_LIVE" });
    await waitFor(
      actor,
      (s) =>
        (
          s.children.voice as ActorRefFrom<typeof voiceMachine> | undefined
        )?.getSnapshot().value === "active",
    );
    actor.stop();
    await flush();
    expect(voiceRequest).toHaveBeenCalledWith(`calls/${callId}/close`, "POST");
    expect(mic.stop).toHaveBeenCalledOnce();
  });
  it("keeps text history separate, blocks chat during voice and saves the transcript on hangup", async () => {
    const body = controller(),
      actor = createActor(conversationMachine, {
        input: { controller: body },
      }).start();
    await waitFor(actor, (s) => s.matches("idle"));
    const original = actor.getSnapshot().context.current.id;
    actor.send({ type: "START_LIVE" });
    await waitFor(
      actor,
      (s) =>
        (
          s.children.voice as ActorRefFrom<typeof voiceMachine> | undefined
        )?.getSnapshot().value === "active",
    );
    expect(actor.getSnapshot().context.current.id).not.toBe(original);
    expect(actor.getSnapshot().context.current.mode).toBe("voice");
    actor.send({ type: "SEND", content: "Should not start ordinary chat" });
    const receive = vi.mocked(observeVoiceEvents).mock.calls.at(-1)![1];
    receive(
      1,
      event("transcript", {
        role: "user",
        delta: "Wave",
        start_ms: 0,
        end_ms: 500,
      }),
    );
    receive(
      2,
      event("transcript", {
        role: "user",
        delta: " please",
        start_ms: 501,
        end_ms: 800,
      }),
    );
    expect(actor.getSnapshot().context.current.title).toBe("Wave please");
    actor.getSnapshot().children.voice!.send({ type: "END" });
    await waitFor(actor, (s) => s.matches("idle"));
    expect(
      actor.getSnapshot().context.current.messages.map((m) => m.content),
    ).toEqual(["Wave please"]);
    expect(actor.getSnapshot().context.current.voiceCalls).toEqual([callId]);
    actor.stop();
  });
});
