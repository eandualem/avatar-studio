import { assign, fromObservable, fromPromise, setup } from "xstate";
import type { MotionController } from "@/types/avatar";
import type { VoiceView } from "@/types/voice";
import type { Message } from "@/types/conversation";
import { VoiceClient } from "@/lib/voice-client";

export const voiceMachine = setup({
  types: {
    input: {} as {
      sessionId: string;
      controller: MotionController;
      history: Message[];
      initialStill?: boolean;
    },
    output: {} as { messages: Message[]; error: string },
    context: {} as { client: VoiceClient; view: VoiceView; error: string },
    events: {} as
      | { type: "END" }
      | { type: "MUTE" }
      | { type: "PLAY" }
      | { type: "RESET_POSE" }
      | { type: "CANCEL_WORK" },
  },
  actors: {
    observe: fromObservable<VoiceView, VoiceClient>(({ input }) => ({
      subscribe: (observer) => {
        const listener =
          typeof observer === "function"
            ? observer
            : (value: VoiceView) => observer.next?.(value);
        const unsubscribe = input.subscribe(listener);
        return {
          unsubscribe: () => {
            unsubscribe();
            void input.end().catch(() => {});
          },
        };
      },
    })),
    connect: fromPromise(({ input }: { input: VoiceClient }) => input.start()),
    close: fromPromise(({ input }: { input: VoiceClient }) => input.end()),
    cancelWork: fromPromise(({ input }: { input: VoiceClient }) =>
      input.cancelWork(),
    ),
  },
  guards: {
    sessionEnded: ({ context }) =>
      !!context.view.fatal || context.view.remoteClosed,
  },
}).createMachine({
  id: "voice",
  description:
    "Owns one live conversation. client: media and runtime transport lifetime; view: observed transcripts, playback and remote state; error: failure shown after cleanup.",
  context: ({ input }) => {
    const client = new VoiceClient(
      input.sessionId,
      input.controller,
      input.history,
      input.initialStill,
    );
    return { client, view: client.snapshot(), error: "" };
  },
  initial: "connecting",
  invoke: {
    id: "events",
    src: "observe",
    input: ({ context }) => context.client,
    onSnapshot: {
      actions: assign({
        view: ({ event, context }) => event.snapshot.context || context.view,
      }),
      description:
        "Observe media and backend events without mirroring transport reconnects.",
    },
    onError: {
      target: ".closing",
      actions: assign({ error: () => "Live event observation failed." }),
      description: "Close a call whose events cannot be observed safely.",
    },
  },
  output: ({ context }) => ({
    messages: context.view.messages,
    error: context.error || context.view.fatal || context.view.warning,
  }),
  exit: ({ context }) => {
    void context.client.end().catch(() => {});
  },
  states: {
    connecting: {
      description:
        "Check voice availability, obtain microphone access and negotiate WebRTC.",
      on: {
        END: {
          target: "closing",
          description:
            "Cancel setup and close any provider call returned afterward.",
        },
      },
      invoke: {
        src: "connect",
        input: ({ context }) => context.client,
        onDone: {
          target: "active",
          description:
            "Enable conversation controls after browser and provider connection.",
        },
        onError: {
          target: "closing",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : "Could not connect live audio.",
          }),
          description:
            "Clean up media and any allocated provider session after connection failure.",
        },
      },
    },
    active: {
      description:
        "Keep audio connected while the user talks and the backend performs actions.",
      always: {
        guard: "sessionEnded",
        target: "closing",
        description:
          "Close local resources when the remote session ends or transport recovery fails.",
      },
      on: {
        END: {
          target: "closing",
          description:
            "End the live conversation and confirm provider closure.",
        },
        MUTE: {
          actions: ({ context }) => context.client.toggleMic(),
          description: "Toggle the actual microphone track.",
        },
        PLAY: {
          actions: ({ context }) => context.client.playSound(),
          description:
            "Use a user gesture to enable blocked browser audio playback.",
        },
        CANCEL_WORK: {
          target: "cancelling",
          description:
            "Stop body motion and request backend cancellation while retaining audio.",
        },
        RESET_POSE: {
          actions: ({ context }) => context.client.resetPose(),
          description:
            "Invalidate pending body decisions and reset the engine immediately.",
        },
      },
    },
    cancelling: {
      description:
        "Confirm cancellation of delegated work while the voice call stays open.",
      on: {
        END: {
          target: "closing",
          description: "Hang up even while delegated work is cancelling.",
        },
      },
      invoke: {
        src: "cancelWork",
        input: ({ context }) => context.client,
        onDone: {
          target: "active",
          description: "Continue listening after backend cancellation.",
        },
        onError: {
          target: "closing",
          actions: assign({
            error: () =>
              "Movement stopped locally, but backend cancellation could not be confirmed.",
          }),
          description: "End the call after an unconfirmed cancellation.",
        },
      },
    },
    closing: {
      description:
        "Await provider close before disposing the microphone, speaker and event connection.",
      invoke: {
        src: "close",
        input: ({ context }) => context.client,
        onDone: {
          target: "ended",
          description: "Return to chat after voice resources are released.",
        },
        onError: {
          target: "ended",
          actions: assign({
            error: ({ context, event }) =>
              [
                context.error,
                event.error instanceof Error
                  ? event.error.message
                  : "Could not confirm the call ended.",
              ]
                .filter(Boolean)
                .join(" "),
          }),
          description:
            "Expose an unconfirmed provider close after stopping local audio.",
        },
      },
    },
    ended: {
      type: "final",
      description:
        "Return the visible transcript and any final error to the conversation.",
    },
  },
});
