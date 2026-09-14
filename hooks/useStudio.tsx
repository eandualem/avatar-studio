"use client";
import { createActorContext, useSelector } from "@xstate/react";
import { useCallback, useEffect, useEffectEvent } from "react";
import { appMachine } from "@/machines/appMachine";
import { VoicePhase } from "@/types/voice";
import type { ActorRefFrom } from "xstate";
import type { voiceMachine } from "@/machines/voiceMachine";
import type { Pending } from "@/types/conversation";

export const StudioProvider = createActorContext(appMachine);
export function useAvatar() {
  const actor = StudioProvider.useSelector((s) => s.context.avatar);
  const state = useSelector(actor, (s) => s.value);
  const error = useSelector(actor, (s) => s.context.error);
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas) actor.send({ type: "ATTACH", canvas });
      else actor.send({ type: "DETACH" });
    },
    [actor],
  );
  return {
    state,
    data: { error },
    actions: { canvasRef, retry: () => actor.send({ type: "RETRY" }) },
  };
}
export function useConversation() {
  const actor = StudioProvider.useSelector((s) => s.context.conversation);
  const state = useSelector(actor, (s) => s.value);
  const current = useSelector(actor, (s) => s.context.current);
  const history = useSelector(actor, (s) => s.context.history);
  const error = useSelector(actor, (s) => s.context.error);
  return {
    state,
    data: { current, history, error },
    actions: {
      send: (content: string) => actor.send({ type: "SEND", content }),
      stop: () => actor.send({ type: "STOP" }),
      newConversation: () => actor.send({ type: "NEW" }),
      select: (id: string) => actor.send({ type: "SELECT", id }),
    },
  };
}
export function useVoice() {
  const conversation = StudioProvider.useSelector(
    (s) => s.context.conversation,
  );
  const speech = StudioProvider.useSelector((s) => s.context.speech);
  const actor = useSelector(
    conversation,
    (s) => s.children.voice as ActorRefFrom<typeof voiceMachine> | undefined,
  );
  const phase = useSelector(
    actor,
    (s) =>
      ({
        connecting: VoicePhase.Connecting,
        active: VoicePhase.Active,
        cancelling: VoicePhase.Cancelling,
        closing: VoicePhase.Closing,
        ended: VoicePhase.Idle,
      })[s?.value || "ended"],
  );
  const view = useSelector(actor, (s) => s?.context.view);
  return {
    state: phase,
    data: { view },
    actions: {
      start: () => {
        speech.send({ type: "STOP" });
        conversation.send({ type: "START_LIVE" });
      },
      end: () => actor?.send({ type: "END" }),
      mute: () => actor?.send({ type: "MUTE" }),
      play: () => actor?.send({ type: "PLAY" }),
      stopWork: () => actor?.send({ type: "CANCEL_WORK" }),
    },
  };
}
export function useMotionLab() {
  const actor = StudioProvider.useSelector((s) => s.context.conversation);
  const speech = StudioProvider.useSelector((s) => s.context.speech);
  const active = useSelector(actor, (s) => s.matches("dev"));
  const running = useSelector(actor, (s) => s.matches({ dev: "running" }));
  const pose = useSelector(actor, (s) => s.context.labPose);
  const report = useSelector(actor, (s) => s.context.labReport);
  return {
    active,
    running,
    pose,
    report,
    open: () => {
      speech.send({ type: "STOP" });
      actor.send({ type: "OPEN_DEV" });
    },
    close: () => actor.send({ type: "CLOSE_DEV" }),
    run: (tool_name: string, args: Pending["arguments"]) =>
      actor.send({
        type: "DEV_RUN",
        call: { call_id: crypto.randomUUID(), tool_name, arguments: args },
      }),
    stop: () => actor.send({ type: "STOP" }),
  };
}
export function useSpeech(onTranscript: (text: string) => void) {
  const actor = StudioProvider.useSelector((s) => s.context.speech);
  const state = useSelector(actor, (s) => s.value);
  const transcript = useSelector(actor, (s) => s.context.transcript);
  const error = useSelector(actor, (s) => s.context.error);
  const deliver = useEffectEvent(onTranscript);
  useEffect(() => {
    let previous = actor.getSnapshot().context.transcript;
    const subscription = actor.subscribe((snapshot) => {
      const next = snapshot.context.transcript;
      if (next && next !== previous) deliver(next);
      previous = next;
    });
    return () => subscription.unsubscribe();
  }, [actor]);
  return {
    state,
    data: { transcript, error },
    actions: {
      start: () => actor.send({ type: "START" }),
      stop: () => actor.send({ type: "STOP" }),
    },
  };
}
