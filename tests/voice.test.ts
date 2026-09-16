import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor, waitFor, type ActorRefFrom } from "xstate";
import type { voiceMachine } from "@/machines/voiceMachine";
import { bodyTransport } from "@/lib/body-runtime";
import { VoiceClient } from "@/lib/voice-client";
import { conversationMachine } from "@/machines/conversationMachine";
import { restPose } from "@/lib/motion";
import type { MotionController, MotionResult } from "@/types/avatar";
import {
  voiceRequest,
  observeVoiceEvents,
  VoiceHttpError,
} from "@/lib/voice-http";

vi.mock("@/lib/body-runtime", () => ({
  bodyTransport: {
    decide: vi.fn(async () => null),
    receipt: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  },
}));
vi.mock("@/lib/voice-http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voice-http")>()),
  voiceRequest: vi.fn(),
  observeVoiceEvents: vi.fn(() => vi.fn()),
}));
const callId = "c3a45b02-ab96-43be-9d0f-2b9e449b96fb";
const offer = {
  mode: "conversation",
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
let speakers: FakeAudio[], audioLevel: number;
class FakeChannel extends EventTarget {
  readyState = "open";
  autoAck = true;
  send = vi.fn((raw: string) => {
    const data = JSON.parse(raw);
    if (this.autoAck)
      this.emit({
        type: data.type.replace(/append$/, "appended"),
        client_event_id: data.event_id,
      });
  });
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
  constructor() {
    speakers.push(this);
  }
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
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createAnalyser = vi.fn(() => ({
    fftSize: 256,
    getByteTimeDomainData: (data: Uint8Array) => data.fill(audioLevel),
  }));
}
function controller(): MotionController {
  return {
    ready: () => true,
    pose: restPose,
    attach: vi.fn(),
    detach: vi.fn(),
    stop: vi.fn(),
    setSpeechLevel: vi.fn(),
    execute: vi.fn(async () => completed),
  };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  vi.clearAllMocks();
  peers = [];
  speakers = [];
  audioLevel = 128;
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
    if (path === "status")
      return {
        enabled: true,
        configured: true,
        conversation_mode_supported: true,
      };
    if (path === "calls") return offer;
    if (path === `calls/${callId}`)
      return { cursor: 0, status: "active", transcript: [], delegations: {} };
    if (path.endsWith("/close")) return { status: "closed", finalized: true };
    return { accepted: true };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("live audio lifecycle and independent motion", () => {
  it("recovers blocked playback and bases speaking on audible media rather than server status", async () => {
    let frame!: FrameRequestCallback;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frame = callback;
        return 1;
      }),
    );
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    const motion = controller();
    const client = new VoiceClient("session", motion);
    await client.start();
    client.receive(event("status", { status: "active" }));
    expect(client.snapshot().speaking).toBe(false);
    speakers[0].play.mockRejectedValueOnce(
      new DOMException("Playback blocked", "NotAllowedError"),
    );
    peers[0].ontrack?.({ streams: [media] } as unknown as RTCTrackEvent);
    await flush();
    expect(client.snapshot().soundBlocked).toBe(true);
    audioLevel = 155;
    frame(1000);
    expect(motion.setSpeechLevel).toHaveBeenLastCalledWith(0);
    audioLevel = 128;
    now.mockReturnValue(1200);
    client.playSound();
    await flush();
    expect(client.snapshot().soundBlocked).toBe(false);
    frame(1000);
    expect(client.snapshot().speaking).toBe(false);
    audioLevel = 155;
    now.mockReturnValue(5000);
    frame(5000);
    expect(client.snapshot()).toEqual(
      expect.objectContaining({ speaking: true, elapsed: 4 }),
    );
    expect(vi.mocked(motion.setSpeechLevel!).mock.lastCall![0]).toBeGreaterThan(
      0.5,
    );
    speakers[0].paused = true;
    frame(5001);
    expect(motion.setSpeechLevel).toHaveBeenLastCalledWith(0);
    speakers[0].paused = false;
    audioLevel = 128;
    frame(5002);
    expect(motion.setSpeechLevel).toHaveBeenLastCalledWith(0);
    audioLevel = 155;
    frame(5003);
    await client.end();
    expect(motion.setSpeechLevel).toHaveBeenLastCalledWith(0);
    expect(speakers[0].pause).toHaveBeenCalledOnce();
    expect(speakers[0].srcObject).toBeNull();
  });
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
        ? { enabled: true, configured: true, conversation_mode_supported: true }
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
  it("keeps the confirmed setup rejection as the only visible error and releases media", async () => {
    const request = vi.mocked(voiceRequest).getMockImplementation()!;
    const message = "GPT-Live rejected the session configuration (HTTP 400).";
    vi.mocked(voiceRequest).mockImplementation(async (...args) => {
      if (args[0] === "calls")
        throw new VoiceHttpError(message, 502, "rejected");
      return request(...args);
    });
    const actor = createActor(conversationMachine, {
      input: { controller: controller() },
    }).start();
    await waitFor(actor, (s) => s.matches("idle"));
    actor.send({ type: "START_LIVE" });
    await waitFor(actor, (s) => s.matches("idle") && s.context.error !== "");
    expect(actor.getSnapshot().context.error).toBe(message);
    expect(mic.stop).toHaveBeenCalledOnce();
    expect(peers[0].close).toHaveBeenCalledOnce();
    expect(voiceRequest).toHaveBeenCalledTimes(2);
    actor.stop();
  });
  it.each([
    new VoiceHttpError("Legacy runtime failure", 400),
    new VoiceHttpError("Provider timeout", 502, "unknown"),
    new TypeError("Failed to fetch"),
  ])(
    "retains the allocation warning for uncertain setup: %s",
    async (error) => {
      const request = vi.mocked(voiceRequest).getMockImplementation()!;
      vi.mocked(voiceRequest).mockImplementation(async (...args) => {
        if (args[0] === "calls") throw error;
        return request(...args);
      });
      const client = new VoiceClient("session", controller());
      await expect(client.start()).rejects.toBe(error);
      await expect(client.end()).rejects.toThrow(
        "Voice setup could not be confirmed",
      );
      expect(mic.stop).toHaveBeenCalledOnce();
      expect(peers[0].close).toHaveBeenCalledOnce();
      expect(voiceRequest).toHaveBeenCalledTimes(2);
    },
  );
  it("closes an allocated call when its answer is malformed", async () => {
    vi.mocked(voiceRequest).mockImplementation(async (path) =>
      path === "status"
        ? { enabled: true, configured: true, conversation_mode_supported: true }
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

it("starts a body decision from user speech without delegation and keeps only Live speech visible", async () => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  const motion = controller();
  vi.mocked(bodyTransport.decide).mockResolvedValueOnce({
    ...pending,
    arguments: { ...pending.arguments, intent: "explicit", label: "wave" },
  });
  vi.mocked(motion.execute).mockImplementationOnce(async (_m, _s, started) => {
    started?.();
    return completed;
  });
  const client = new VoiceClient("session", motion, [
    { id: "prior", role: "assistant", content: "Earlier conversation" },
  ]);
  await client.start();
  expect(voiceRequest).toHaveBeenCalledWith(
    "calls",
    "POST",
    expect.objectContaining({
      mode: "conversation",
      history: [{ role: "assistant", content: "Earlier conversation" }],
    }),
  );
  client.receive(
    event("transcript", { role: "user", delta: "Wave please" }),
    1,
  );
  client.receive(event("transcript", { role: "assistant", delta: "Sure." }), 2);
  client.receive(
    event("delegation", {
      id: "old",
      status: "pending_host",
      pending_tool_call: pending,
    }),
    3,
  );
  client.receive(
    event("backend", {
      delegation_id: "old",
      event: { type: "text_delta", content: "Internal prose" },
    }),
    4,
  );
  await vi.advanceTimersByTimeAsync(900);
  expect(motion.execute).toHaveBeenCalledOnce();
  expect(bodyTransport.decide).toHaveBeenCalledOnce();
  expect(client.snapshot().messages.map((m) => m.content)).toEqual([
    "Wave please",
    "Sure.",
  ]);
  expect(client.snapshot().facts.map((f) => f.status)).toEqual([
    "started",
    "completed",
  ]);
  expect(
    client.snapshot().facts.every((f) => f.acknowledgedAt !== undefined),
  ).toBe(true);
  expect(
    vi
      .mocked(voiceRequest)
      .mock.calls.some(([path]) => /tool-result|context|cancel/.test(path)),
  ).toBe(false);
  await client.end();
});

it("ignores delegated execution in both events and snapshots, including after stop", async () => {
  const motion = controller(),
    client = new VoiceClient("session", motion);
  await client.start();
  client.receive(
    event("delegation", {
      id: "old",
      status: "pending_host",
      pending_tool_call: pending,
    }),
    1,
  );
  await client.cancelWork();
  client.receive(
    event("snapshot", {
      cursor: 8,
      status: "active",
      transcript: [{ role: "user", delta: "Old wave" }],
      active_delegation: "old",
      delegations: { old: { status: "pending_host" } },
      pending_tool_call: pending,
    }),
  );
  client.receive(event("transcript", { role: "user", delta: "Old wave" }), 2);
  expect(motion.execute).not.toHaveBeenCalled();
  expect(client.snapshot().messages.map((m) => m.content)).toEqual([
    "Old wave",
  ]);
  await client.end();
});

it("stop and reset invalidate late body decisions while Live remains connected", async () => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  const motion = controller(),
    client = new VoiceClient("session", motion);
  motion.reset = vi.fn(restPose);
  let finish!: (value: typeof pending) => void;
  vi.mocked(bodyTransport.decide).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await client.start();
  client.receive(event("transcript", { role: "user", delta: "Wave" }), 1);
  await vi.advanceTimersByTimeAsync(900);
  client.resetPose();
  finish(pending);
  await vi.advanceTimersByTimeAsync(0);
  expect(motion.reset).toHaveBeenCalledOnce();
  expect(motion.execute).not.toHaveBeenCalled();
  expect(mic.enabled).toBe(true);
  expect(peers[0].close).not.toHaveBeenCalled();
  await client.end();
});

it("rejects old delegated-only runtimes before microphone access and allocation", async () => {
  vi.mocked(voiceRequest).mockResolvedValueOnce({
    enabled: true,
    configured: true,
  });
  const client = new VoiceClient("session", controller());
  await expect(client.start()).rejects.toThrow(
    "independent body control support",
  );
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(voiceRequest).toHaveBeenCalledTimes(1);
  await client.end();
});

describe("per-call persona on a shared backend", () => {
  it("sends the profile and Live instructions on creation and skips the append when supported", async () => {
    vi.mocked(voiceRequest).mockImplementation(async (path) =>
      path === "status"
        ? {
            enabled: true,
            configured: true,
            conversation_mode_supported: true,
            call_instructions_supported: true,
          }
        : path === "calls"
          ? offer
          : { finalized: true, status: "closed" },
    );
    const client = new VoiceClient("session", controller());
    await client.start();
    expect(voiceRequest).toHaveBeenCalledWith(
      "calls",
      "POST",
      expect.objectContaining({
        mode: "conversation",
        profile: "avatar_studio",
        instructions: expect.stringContaining("Charlie"),
      }),
    );
    const appended = peers[0].channel.send.mock.calls.filter(([raw]) =>
      raw.includes("session.instructions.append"),
    );
    expect(appended).toEqual([]);
    expect(mic.enabled).toBe(true);
    await client.end();
  });

  it("falls back to appending the policy over the data channel on older runtimes", async () => {
    const client = new VoiceClient("session", controller());
    await client.start();
    expect(voiceRequest).toHaveBeenCalledWith(
      "calls",
      "POST",
      expect.not.objectContaining({ profile: expect.anything() }),
    );
    const appended = peers[0].channel.send.mock.calls.filter(([raw]) =>
      raw.includes("session.instructions.append"),
    );
    expect(appended).toHaveLength(1);
    await client.end();
  });
});
