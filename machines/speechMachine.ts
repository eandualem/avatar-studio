import { setup, assign, fromCallback } from "xstate";
import { recognitionConstructor } from "@/lib/dictation";

export const speechMachine = setup({
  types: {
    context: {} as { transcript: string; error: string },
    events: {} as
      | { type: "START" }
      | { type: "STOP" }
      | { type: "RESULT"; text: string }
      | { type: "FAIL"; message: string }
      | { type: "END" },
  },
  actors: {
    listen: fromCallback(({ sendBack }) => {
      const Constructor = recognitionConstructor();
      if (!Constructor) {
        sendBack({
          type: "FAIL",
          message:
            "Dictation is unavailable in this browser. You can type instead.",
        });
        return;
      }
      const recognition = new Constructor();
      recognition.lang = navigator.language || "en-US";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        for (let i = 0; i < event.results.length; i++)
          if (event.results[i].isFinal)
            sendBack({ type: "RESULT", text: event.results[i][0].transcript });
      };
      recognition.onerror = (event) =>
        sendBack({
          type: "FAIL",
          message:
            event.error === "not-allowed"
              ? "Microphone permission was declined. You can type instead."
              : "Dictation could not hear you. Please try again or type.",
        });
      recognition.onend = () => sendBack({ type: "END" });
      try {
        recognition.start();
      } catch {
        sendBack({ type: "FAIL", message: "The microphone could not start." });
      }
      return () => {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      };
    }),
  },
}).createMachine({
  id: "speech",
  description:
    "Controls browser microphone dictation.\n- transcript: last recognized text for the composer\n- error: microphone feedback",
  context: { transcript: "", error: "" },
  initial: "idle",
  states: {
    idle: {
      description: "Microphone is off.",
      on: {
        START: {
          target: "listening",
          actions: assign({ transcript: "", error: "" }),
          description: "Start dictation after the user presses the microphone.",
        },
      },
    },
    listening: {
      description: "Listen for one dictated utterance.",
      invoke: { src: "listen" },
      on: {
        RESULT: {
          actions: assign({ transcript: ({ event }) => event.text }),
          description: "Put recognized speech into the editable composer.",
        },
        FAIL: {
          target: "idle",
          actions: assign({ error: ({ event }) => event.message }),
          description: "Show actionable microphone feedback.",
        },
        END: {
          target: "idle",
          description: "Release the microphone after recognition ends.",
        },
        STOP: {
          target: "idle",
          description: "Release the microphone on user request.",
        },
      },
    },
  },
});
