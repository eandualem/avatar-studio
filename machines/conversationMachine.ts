import { setup, assign, fromPromise } from "xstate";
import { sendTurn, cancelTurn } from "@/lib/runtime";
import { executeTool } from "@/lib/host-tools";
import { loadHistory, newConversation, saveHistory } from "@/lib/history";
import { voiceMachine } from "./voiceMachine";
import type {
  Conversation,
  Pending,
  Reply,
  ToolReceipt,
} from "@/types/conversation";
import type { MotionController } from "@/types/avatar";

type Context = {
  controller: MotionController;
  history: Conversation[];
  current: Conversation;
  pending: Pending | null;
  receipt: ToolReceipt | null;
  receipts: Record<string, ToolReceipt>;
  error: string;
  rounds: number;
  voiceHistory: Conversation["messages"];
};
type Events =
  | { type: "SEND"; content: string }
  | { type: "NEW" }
  | { type: "SELECT"; id: string }
  | { type: "START_LIVE" }
  | { type: "STOP" };
function incorporate(current: Conversation, reply: Reply): Conversation {
  if (!reply.content) return current;
  const id = reply.message_id || crypto.randomUUID();
  const existing = current.messages.find((m) => m.id === id);
  return {
    ...current,
    messages: existing
      ? current.messages.map((m) =>
          m.id === id ? { ...m, content: reply.content! } : m,
        )
      : [
          ...current.messages,
          { id, role: "assistant", content: reply.content },
        ],
  };
}
export const conversationMachine = setup({
  types: {
    context: {} as Context,
    input: {} as { controller: MotionController },
    events: {} as Events,
  },
  actors: {
    voice: voiceMachine,
    restore: fromPromise(async () => loadHistory()),
    request: fromPromise(
      ({ input, signal }: { input: Context; signal: AbortSignal }) =>
        sendTurn(
          input.current,
          input.controller,
          signal,
          input.pending && input.receipt
            ? { pending: input.pending, receipt: input.receipt }
            : undefined,
        ),
    ),
    perform: fromPromise(
      ({ input, signal }: { input: Context; signal: AbortSignal }) =>
        input.receipts[input.pending!.call_id]
          ? Promise.resolve(input.receipts[input.pending!.call_id])
          : executeTool(input.pending!, input.controller, signal),
    ),
    cancel: fromPromise(({ input }: { input: Conversation }) =>
      cancelTurn(input.id, input.mode),
    ),
  },
  guards: {
    hasTool: ({ context }) => !!context.pending && context.rounds < 12,
    tooManyTools: ({ context }) => !!context.pending && context.rounds >= 12,
    hasContent: ({ event }) => event.type === "SEND" && !!event.content.trim(),
  },
  actions: {
    persist: ({ context }) =>
      saveHistory([
        context.current,
        ...context.history.filter((c) => c.id !== context.current.id),
      ]),
    remember: assign({
      history: ({ context }) =>
        [
          context.current,
          ...context.history.filter((c) => c.id !== context.current.id),
        ].slice(0, 50),
    }),
    stopMotion: ({ context }) => context.controller.stop(),
  },
}).createMachine({
  id: "conversation",
  description:
    "Coordinates assistant turns and host execution. controller: live body service; history: saved conversations; current: selected conversation; pending: requested action; receipt: result awaiting continuation; receipts: completed calls; error: visible failure; rounds: tool-loop bound; voiceHistory: messages preceding the active voice call.",
  context: ({ input }) => ({
    ...input,
    history: [],
    current: newConversation(),
    pending: null,
    receipt: null,
    receipts: {},
    error: "",
    rounds: 0,
    voiceHistory: [],
  }),
  initial: "loading",
  states: {
    loading: {
      description: "Restore browser conversation history.",
      invoke: {
        src: "restore",
        onDone: {
          target: "idle",
          actions: assign({
            history: ({ event }) => event.output,
            current: ({ event }) => event.output[0] || newConversation(),
          }),
          description: "Open the most recent local conversation.",
        },
        onError: {
          target: "idle",
          description: "Use an empty history when storage cannot be read.",
        },
      },
    },
    idle: {
      description: "Ready for a new user message or conversation.",
      on: {
        START_LIVE: {
          target: "live",
          actions: [
            "remember",
            "persist",
            assign({
              current: ({ context }) =>
                context.current.mode === "voice"
                  ? context.current
                  : {
                      ...newConversation(),
                      title: "Live conversation",
                      mode: "voice" as const,
                    },
              error: "",
            }),
            assign({ voiceHistory: ({ context }) => context.current.messages }),
          ],
          description:
            "Start a dedicated live conversation or resume a saved voice conversation without changing text-session ownership.",
        },
        SEND: {
          guard: "hasContent",
          target: "requesting",
          actions: [
            assign({
              current: ({ context, event }) => ({
                ...context.current,
                title: context.current.messages.length
                  ? context.current.title
                  : event.content.trim().slice(0, 42),
                messages: [
                  ...context.current.messages,
                  {
                    id: crypto.randomUUID(),
                    role: "user" as const,
                    content: event.content.trim(),
                  },
                ],
              }),
              error: "",
              pending: null,
              receipt: null,
              receipts: {},
              rounds: 0,
            }),
            "remember",
            "persist",
          ],
          description: "Submit a new user message with current pose context.",
        },
        NEW: {
          actions: [
            "remember",
            assign({ current: () => newConversation(), error: "" }),
            "persist",
          ],
          description: "Start a fresh conversation.",
        },
        SELECT: {
          actions: [
            "remember",
            assign({
              current: ({ context, event }) =>
                context.history.find((c) => c.id === event.id) ||
                context.current,
              error: "",
            }),
          ],
          description: "Open a saved conversation.",
        },
      },
    },
    requesting: {
      description: "Wait for the assistant response.",
      on: {
        STOP: {
          target: "cancelling",
          actions: "stopMotion",
          description: "Cancel the active assistant turn.",
        },
      },
      invoke: {
        src: "request",
        input: ({ context }) => context,
        onDone: {
          target: "routing",
          actions: [
            assign({
              current: ({ context, event }) =>
                incorporate(context.current, event.output),
              pending: ({ event }) => event.output.pending_tool_call || null,
              receipt: null,
            }),
            "remember",
            "persist",
          ],
          description: "Record the response and inspect its pending action.",
        },
        onError: {
          target: "idle",
          actions: assign({
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : "The assistant could not respond.",
          }),
          description:
            "Allow a new message after a failed request without replaying mutations.",
        },
      },
    },
    live: {
      description:
        "Reserve this conversation for a live voice actor; ordinary chat and navigation wait for hangup.",
      invoke: {
        id: "voice",
        src: "voice",
        input: ({ context }) => ({
          sessionId: context.current.id,
          controller: context.controller,
          history: context.current.messages,
        }),
        onSnapshot: {
          actions: [
            assign({
              current: ({ context, event }) => {
                const messages = [
                  ...context.voiceHistory,
                  ...event.snapshot.context.view.messages,
                ].slice(-400);
                const title =
                  context.voiceHistory.length === 0
                    ? messages
                        .find((m) => m.role === "user")
                        ?.content.slice(0, 42) || context.current.title
                    : context.current.title;
                const callId = event.snapshot.context.view.callId;
                const voiceCalls = callId
                  ? [
                      ...new Set([
                        ...(context.current.voiceCalls || []),
                        callId,
                      ]),
                    ].slice(-100)
                  : context.current.voiceCalls;
                return { ...context.current, messages, title, voiceCalls };
              },
            }),
            "remember",
            "persist",
          ],
          description:
            "Keep live transcript fragments and full backend replies visible and saved.",
        },
        onDone: {
          target: "idle",
          actions: [
            assign({
              current: ({ context, event }) => ({
                ...context.current,
                messages: [
                  ...context.voiceHistory,
                  ...event.output.messages,
                ].slice(-400),
              }),
              error: ({ event }) => event.output.error,
              voiceHistory: [],
            }),
            "remember",
            "persist",
          ],
          description:
            "Keep the completed voice conversation available for voice or typed continuation.",
        },
        onError: {
          target: "idle",
          actions: assign({
            error: () => "The live conversation stopped unexpectedly.",
          }),
          description: "Expose an unexpected voice actor failure.",
        },
      },
    },
    routing: {
      description: "Continue a host tool or finish the turn.",
      always: [
        {
          guard: "hasTool",
          target: "moving",
          description: "Perform the pending host action.",
        },
        {
          guard: "tooManyTools",
          target: "cancelling",
          actions: assign({
            error: () =>
              "Paused after several movements. Send another message to continue.",
          }),
          description: "Bound autonomous tool execution.",
        },
        { target: "idle", description: "Return control to the user." },
      ],
    },
    moving: {
      description:
        "Execute the assistant motion and wait for its actual result.",
      on: {
        STOP: {
          target: "cancelling",
          actions: "stopMotion",
          description: "Interrupt the body and stop further assistant actions.",
        },
      },
      invoke: {
        src: "perform",
        input: ({ context }) => context,
        onDone: {
          target: "requesting",
          actions: assign({
            receipt: ({ event }) => event.output,
            receipts: ({ context, event }) => ({
              ...context.receipts,
              [context.pending!.call_id]: event.output,
            }),
            rounds: ({ context }) => context.rounds + 1,
          }),
          description:
            "Resume the same assistant response with the execution receipt.",
        },
        onError: {
          target: "cancelling",
          actions: assign({
            error: () =>
              "Movement failed. The assistant turn has been stopped.",
          }),
          description:
            "Cancel a failed movement rather than claiming completion.",
        },
      },
    },
    cancelling: {
      description: "Confirm cancellation before accepting another message.",
      invoke: {
        src: "cancel",
        input: ({ context }) => context.current,
        onDone: {
          target: "idle",
          description: "Accept another request after cancellation.",
        },
        onError: {
          target: "idle",
          actions: assign({
            error: () =>
              "Stopped locally; the runtime did not confirm cancellation. A new message will supersede that turn.",
          }),
          description: "Expose an unconfirmed remote cancellation.",
        },
      },
    },
  },
});
