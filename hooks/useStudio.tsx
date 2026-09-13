"use client";
import { createActorContext, useSelector } from "@xstate/react";
import { useCallback, useEffect, useEffectEvent } from "react";
import { appMachine } from "@/machines/appMachine";

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
