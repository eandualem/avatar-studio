import { setup, assign, fromPromise, fromCallback } from "xstate";
import { createRobot } from "@/lib/robot";
import type { MotionController, RigDriver } from "@/types/avatar";

export const avatarMachine = setup({
  types: {
    context: {} as {
      controller: MotionController;
      canvas: HTMLCanvasElement | null;
      driver: RigDriver | null;
      error: string;
    },
    input: {} as { controller: MotionController },
    events: {} as
      | { type: "ATTACH"; canvas: HTMLCanvasElement }
      | { type: "DETACH" }
      | { type: "RETRY" },
  },
  actors: {
    load: fromPromise(
      ({ input, signal }: { input: HTMLCanvasElement; signal: AbortSignal }) =>
        createRobot(input, signal),
    ),
    lifetime: fromCallback(
      ({
        input,
      }: {
        input: { controller: MotionController; driver: RigDriver };
      }) => {
        input.controller.attach(input.driver);
        return () => input.controller.detach();
      },
    ),
  },
}).createMachine({
  id: "avatar",
  description:
    "Loads and owns the live robot.\n- controller: shared motion service\n- canvas: render surface\n- driver: loaded rig\n- error: load failure",
  context: ({ input }) => ({ ...input, canvas: null, driver: null, error: "" }),
  initial: "waiting",
  on: {
    DETACH: {
      target: ".waiting",
      description: "Release the renderer when the canvas leaves the page.",
    },
  },
  states: {
    waiting: {
      description: "Await the canvas.",
      on: {
        ATTACH: {
          target: "loading",
          actions: assign({ canvas: ({ event }) => event.canvas }),
          description: "Load the robot into the mounted canvas.",
        },
      },
    },
    loading: {
      description: "Load the exported rig.",
      invoke: {
        src: "load",
        input: ({ context }) => context.canvas!,
        onDone: {
          target: "ready",
          actions: assign({ driver: ({ event }) => event.output }),
          description: "Own the successfully loaded rig.",
        },
        onError: {
          target: "failed",
          actions: assign({
            error: () => "Charlie could not load. Please try again.",
          }),
          description: "Expose a recoverable renderer failure.",
        },
      },
    },
    ready: {
      description: "Render and accept motion targets.",
      invoke: {
        src: "lifetime",
        input: ({ context }) => ({
          controller: context.controller,
          driver: context.driver!,
        }),
      },
    },
    failed: {
      description: "Wait for a deliberate asset retry.",
      on: {
        RETRY: { target: "loading", description: "Retry loading the avatar." },
      },
    },
  },
});
