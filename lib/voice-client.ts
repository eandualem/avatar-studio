import type { MotionController } from "@/types/avatar";
import type { Message, Pending } from "@/types/conversation";
import {
  delegationSchema,
  fragmentSchema,
  initialVoiceView,
  voiceEventSchema,
  voiceOfferSchema,
  type VoiceFragment,
  type VoiceView,
} from "@/types/voice";
import { executeTool, hostContext } from "./host-tools";
import { observeVoiceEvents, voiceRequest, VoiceHttpError } from "./voice-http";
import { spokenMessages } from "./voice-transcript";
import { speechOpening } from "./speech-mouth";
import { VoiceReplies } from "./voice-replies";

const abortError = () =>
  new DOMException("Live connection cancelled", "AbortError");
type Action = {
  delegation: string;
  abort: AbortController;
  submitted: boolean;
};

export class VoiceClient {
  private view = initialVoiceView();
  private listeners = new Set<(view: VoiceView) => void>();
  private peer?: RTCPeerConnection;
  private media?: MediaStream;
  private audio?: HTMLAudioElement;
  private audioContext?: AudioContext;
  private stopEvents?: () => void;
  private callId = "";
  private allocation?: Promise<ReturnType<typeof voiceOfferSchema.parse>>;
  private closing?: Promise<void>;
  private ending = false;
  private disposed = false;
  private cancelling = false;
  private actions = new Map<string, Action>();
  private activeDelegation = "";
  private pendingAction?: { delegation: string; tool: Pending };
  private fragments: VoiceFragment[] = [];
  private answers = new VoiceReplies(() => this.callId);
  private eventCursor = 0;
  private stateCursor = 0;
  private animation = 0;
  private lastSound = 0;
  private started = 0;
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private sessionId: string,
    private controller: MotionController,
    private history: Message[] = [],
  ) {}
  snapshot = () => structuredClone(this.view);
  subscribe = (listener: (view: VoiceView) => void) => {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  };
  private update(values: Partial<VoiceView>) {
    Object.assign(this.view, values);
    for (const listener of this.listeners) listener(this.snapshot());
  }
  private failure = (message: string) => {
    if (!this.ending) this.update({ fatal: message });
  };
  private transcript() {
    this.update({
      messages: [
        ...spokenMessages(this.callId, this.fragments),
        ...this.answers.messages(),
      ].slice(-400),
    });
  }
  private check() {
    if (this.ending) throw abortError();
  }
  async start() {
    const status = await voiceRequest("status");
    this.check();
    if (!status.enabled)
      throw new Error("Live voice is not enabled in the assistant runtime.");
    if (!status.configured)
      throw new Error(
        "Live voice needs an OpenAI API key in the assistant runtime. Your regular text chat is still available.",
      );
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection)
      throw new Error(
        "This browser cannot start live audio. Use a current browser on localhost or HTTPS.",
      );
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw new Error(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow the microphone in your browser and try again."
          : "The microphone could not be opened. Check that it is connected and available.",
      );
    }
    if (this.ending) {
      media.getTracks().forEach((track) => track.stop());
      throw abortError();
    }
    this.media = media;
    this.peer = new RTCPeerConnection();
    window.addEventListener("pagehide", this.leave);
    const peer = this.peer;
    this.audio = new Audio();
    this.audio.autoplay = true;
    this.audioContext = new AudioContext();
    void this.audioContext.resume().catch(() => {});
    peer.ontrack = (event) => {
      if (this.ending) return;
      const remote = event.streams[0] || new MediaStream([event.track]);
      this.audio!.srcObject = remote;
      this.playSound();
      this.measureAudio(remote);
    };
    peer.onconnectionstatechange = () => {
      clearTimeout(this.disconnectTimer);
      if (this.ending) return;
      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      )
        this.failure("The live audio connection ended unexpectedly.");
      if (peer.connectionState === "disconnected")
        this.disconnectTimer = setTimeout(
          () => this.failure("The live audio connection was lost."),
          10000,
        );
    };
    for (const track of media.getTracks()) {
      track.addEventListener("ended", () => {
        if (!this.ending) this.failure("The microphone disconnected.");
      });
      peer.addTrack(track, media);
    }
    const channel = peer.createDataChannel("oai-events");
    let providerStarted = false;
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "session.started") providerStarted = true;
      } catch {
        /* Unrelated provider data never executes application tools. */
      }
    };
    await peer.setLocalDescription(await peer.createOffer());
    await this.waitFor(
      () => peer.iceGatheringState === "complete",
      peer,
      "icegatheringstatechange",
      12000,
    );
    this.check();
    const sdp = peer.localDescription?.sdp;
    if (!sdp)
      throw new Error("The browser did not create an audio connection offer.");
    // Keep allocation observable after cancellation so a late returned call can be closed.
    this.allocation = voiceRequest("calls", "POST", {
      session_id: this.sessionId,
      sdp,
      host_context: hostContext(this.controller, this.history),
    }).then((body) => {
      const id = voiceOfferSchema.shape.call_id.safeParse(body?.call_id);
      if (id.success) {
        this.callId = id.data;
        this.update({ callId: id.data });
      }
      return voiceOfferSchema.parse(body);
    });
    const offer = await this.allocation;
    this.callId = offer.call_id;
    this.update({ callId: this.callId });
    this.check();
    this.stopEvents = observeVoiceEvents(
      `calls/${this.callId}/events`,
      (id, data) => this.receive(data, id),
      () =>
        this.failure(
          "The live event connection could not recover. Ending the call to avoid leaving it running.",
        ),
    );
    await peer.setRemoteDescription({
      type: "answer",
      sdp: offer.transport.sdp,
    });
    await this.waitFor(
      () => peer.connectionState === "connected",
      peer,
      "connectionstatechange",
      20000,
    );
    await this.waitFor(() => providerStarted, channel, "message", 10000);
    this.check();
    this.started = performance.now();
  }
  private waitFor(
    check: () => boolean,
    target: EventTarget,
    event: string,
    timeout: number,
  ) {
    if (check()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer);
        target.removeEventListener(event, changed);
      };
      const changed = () => {
        if (this.ending) {
          finish();
          reject(abortError());
        } else if (check()) {
          finish();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error("The live audio connection timed out."));
      }, timeout);
      target.addEventListener(event, changed);
      changed();
    });
  }
  playSound = () => {
    if (!this.audio || this.ending) return;
    void Promise.all([this.audio.play(), this.audioContext?.resume()])
      .then(() => this.update({ soundBlocked: false }))
      .catch(() => this.update({ soundBlocked: true }));
  };
  private measureAudio(stream: MediaStream) {
    const context = this.audioContext;
    if (!context) return;
    const source = context.createMediaStreamSource(stream),
      analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const measure = () => {
      if (this.ending) return;
      analyser.getByteTimeDomainData(samples);
      const rms = Math.sqrt(
        samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) /
          samples.length,
      );
      this.controller.setSpeechLevel?.(
        speechOpening(
          rms,
          !this.view.soundBlocked &&
            !this.audio!.paused &&
            !this.audio!.muted &&
            !this.view.remoteClosed,
        ),
      );
      const now = performance.now();
      if (rms > 0.015) this.lastSound = now;
      const speaking =
        !this.view.soundBlocked &&
        !this.audio!.paused &&
        now - this.lastSound < 180;
      const elapsed = this.started
        ? Math.floor((now - this.started) / 1000)
        : 0;
      if (speaking !== this.view.speaking || elapsed !== this.view.elapsed)
        this.update({ speaking, elapsed });
      this.animation = requestAnimationFrame(measure);
    };
    cancelAnimationFrame(this.animation);
    measure();
  }
  toggleMic = () => {
    if (!this.media || this.ending) return;
    const muted = !this.view.micMuted;
    this.media.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.update({ micMuted: muted });
  };
  receive(raw: unknown, cursor?: number) {
    const envelope = voiceEventSchema.parse(raw);
    if (envelope.call_id !== this.callId) return;
    const { event, data } = envelope;
    if (cursor !== undefined) {
      if (cursor <= this.eventCursor) return;
      this.eventCursor = cursor;
      // Snapshots include speech/action state, but not backend reply text.
      if (cursor <= this.stateCursor && event !== "backend") return;
      this.stateCursor = Math.max(this.stateCursor, cursor);
    }
    if (event === "snapshot" && typeof data.cursor === "number") {
      if (data.cursor < this.stateCursor) return;
      this.stateCursor = data.cursor;
    }
    if (event === "transcript") {
      this.fragments.push(fragmentSchema.parse(data));
      this.transcript();
    } else if (event === "backend") {
      const inner = data.event as Record<string, unknown>;
      if (this.answers.accept(String(data.delegation_id), inner))
        this.transcript();
      if (inner.type === "error")
        this.update({
          warning:
            typeof inner.message === "string"
              ? inner.message
              : "The assistant could not complete that request.",
        });
    } else if (event === "delegation") {
      const delegation = delegationSchema.parse(data);
      if (["running", "waiting", "pending_host"].includes(delegation.status)) {
        if (this.activeDelegation !== delegation.id) this.abortActions();
        this.activeDelegation = delegation.id;
        this.pendingAction =
          delegation.status === "pending_host" && delegation.pending_tool_call
            ? { delegation: delegation.id, tool: delegation.pending_tool_call }
            : undefined;
        this.update({
          work:
            delegation.status === "pending_host"
              ? "Moving with your idea"
              : "Thinking with you",
        });
      }
      if (
        [
          "superseded",
          "cancelled",
          "failed",
          "result_sent",
          "result_rejected",
        ].includes(delegation.status)
      ) {
        for (const action of this.actions.values())
          if (action.delegation === delegation.id && !action.submitted)
            action.abort.abort();
        if (this.activeDelegation === delegation.id) {
          this.pendingAction = undefined;
          this.update({ work: "" });
        }
      }
      if (delegation.status === "pending_host") this.performPending();
    } else if (event === "snapshot") {
      this.fragments = Array.isArray(data.transcript)
        ? data.transcript.map((item) => fragmentSchema.parse(item))
        : [];
      this.transcript();
      this.applyStatus(data);
      const active =
        typeof data.active_delegation === "string"
          ? data.active_delegation
          : "";
      if (active !== this.activeDelegation) this.abortActions();
      this.activeDelegation = active;
      const states = data.delegations as
        Record<string, { status: string }> | undefined;
      const state = states?.[active];
      if (state?.status !== "pending_host") this.abortActions();
      this.update({
        work:
          state && ["running", "waiting", "pending_host"].includes(state.status)
            ? state.status === "pending_host"
              ? "Moving with your idea"
              : "Thinking with you"
            : "",
      });
      // Only reconcile the snapshot's current pending action, never historical entries.
      this.pendingAction =
        state?.status === "pending_host" && data.pending_tool_call
          ? {
              delegation: active,
              tool: delegationSchema.shape.pending_tool_call.parse(
                data.pending_tool_call,
              )!,
            }
          : undefined;
      this.performPending();
    } else if (event === "status") this.applyStatus(data);
    else if (event === "usage")
      this.update({
        finalized: data.finalized === true || this.view.finalized,
      });
    else if (event === "provider_error")
      this.update({
        warning:
          "The voice service reported an error. Try your request again, or end the call.",
      });
  }
  private applyStatus(data: Record<string, unknown>) {
    if (data.status === "closed" || data.status === "interrupted") {
      this.pendingAction = undefined;
      this.controller.setSpeechLevel?.(0);
      this.abortActions();
      this.update({
        remoteClosed: true,
        finalized: data.finalized === true || this.view.finalized,
        work: "",
        warning:
          data.status === "interrupted"
            ? "The voice session ended without confirmed finalization."
            : this.view.warning,
      });
    }
  }
  private abortActions() {
    for (const action of this.actions.values())
      if (!action.submitted) action.abort.abort();
    this.controller.stop();
  }
  private performPending() {
    if (this.pendingAction)
      void this.perform(this.pendingAction.delegation, this.pendingAction.tool);
  }
  private async perform(delegation: string, pending: Pending) {
    const key = `${delegation}:${pending.call_id}`;
    if (
      this.ending ||
      this.cancelling ||
      this.view.remoteClosed ||
      this.actions.has(key) ||
      this.activeDelegation !== delegation
    )
      return;
    const action: Action = {
      delegation,
      abort: new AbortController(),
      submitted: false,
    };
    this.actions.set(key, action);
    const receipt = await executeTool(
      pending,
      this.controller,
      action.abort.signal,
    );
    if (
      this.ending ||
      this.cancelling ||
      action.abort.signal.aborted ||
      this.activeDelegation !== delegation
    )
      return;
    try {
      await voiceRequest(`calls/${this.callId}/context`, "PATCH", {
        host_context: hostContext(this.controller, [
          ...this.history,
          ...this.view.messages,
        ]),
      });
      if (
        this.ending ||
        this.cancelling ||
        action.abort.signal.aborted ||
        this.activeDelegation !== delegation
      )
        return;
      action.submitted = true;
      await voiceRequest(
        `calls/${this.callId}/delegations/${encodeURIComponent(delegation)}/tool-result`,
        "POST",
        {
          tool_call_id: pending.call_id,
          tool_result: receipt.result,
          tool_outcome: receipt.outcome || "success",
        },
      );
    } catch (error) {
      if (this.ending) return;
      // A lost acknowledgement never repeats a physical action or resubmits blindly.
      this.update({
        warning:
          error instanceof VoiceHttpError && error.status === 409
            ? "That movement was superseded or already recorded."
            : "The movement finished locally, but its result could not be confirmed. It will not be repeated automatically.",
      });
      try {
        await this.reconcile();
      } catch {
        this.failure("Could not reconcile the live session after a movement.");
      }
    }
  }
  private async reconcile() {
    const data = await voiceRequest(`calls/${this.callId}`);
    if (!Number.isSafeInteger(data.cursor) || data.cursor < 0)
      throw new Error("The runtime returned an invalid voice snapshot.");
    if (!this.ending)
      this.receive({
        type: "voice",
        call_id: this.callId,
        event: "snapshot",
        data,
      });
  }
  async cancelWork() {
    this.cancelling = true;
    this.pendingAction = undefined;
    this.abortActions();
    this.update({ work: "" });
    try {
      if (this.callId && !this.ending)
        await voiceRequest(`calls/${this.callId}/cancel`, "POST");
    } finally {
      this.cancelling = false;
    }
    if (this.callId && !this.ending) {
      await this.reconcile();
      this.performPending();
    }
  }
  private leave = () => {
    this.ending = true;
    this.controller.setSpeechLevel?.(0);
    this.abortActions();
    if (this.callId)
      void fetch(`/api/voice/calls/${this.callId}/close`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    this.disposeMedia();
  };
  end = (): Promise<void> => {
    if (this.closing) return this.closing;
    this.ending = true;
    this.controller.setSpeechLevel?.(0);
    this.abortActions();
    this.media?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    if (this.audio) this.audio.muted = true;
    this.closing = (async () => {
      try {
        if (this.allocation && !this.callId) {
          try {
            const offer = await this.allocation;
            this.callId = offer.call_id;
          } catch {
            if (!this.callId)
              throw new Error(
                "Voice setup could not be confirmed. Local audio has stopped; check the runtime before starting another call.",
              );
          }
        }
        if (this.callId) {
          const result = await voiceRequest(
            `calls/${this.callId}/close`,
            "POST",
          );
          this.update({ finalized: result.finalized === true });
          if (!result.finalized)
            throw new Error(
              "Audio stopped locally, but the provider did not confirm that the call ended. Check the runtime before starting another call.",
            );
        }
      } finally {
        this.disposeMedia();
      }
    })();
    return this.closing;
  };
  private disposeMedia() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.setSpeechLevel?.(0);
    window.removeEventListener("pagehide", this.leave);
    clearTimeout(this.disconnectTimer);
    cancelAnimationFrame(this.animation);
    this.stopEvents?.();
    this.media?.getTracks().forEach((track) => track.stop());
    this.peer?.close();
    this.audio?.pause();
    if (this.audio) this.audio.srcObject = null;
    void this.audioContext?.close().catch(() => {});
    this.update({ speaking: false, work: "" });
  }
}
