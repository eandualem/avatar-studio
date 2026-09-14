import { afterEach, expect, it, vi } from "vitest";
import { createActor, waitFor } from "xstate";
import { conversationMachine } from "@/machines/conversationMachine";
import { restPose, createMotionController } from "@/lib/motion";
import { motionExamples, previewMotion } from "@/lib/motion-lab";
import { hostContext } from "@/lib/host-tools";
import type { MotionController, MotionResult } from "@/types/avatar";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("resets a running test, discards its late receipt, and stays ready without network calls", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  let finish!: (result: MotionResult) => void;
  let executionSignal!: AbortSignal;
  const controller: MotionController = {
    ready: () => true,
    pose: restPose,
    attach: vi.fn(),
    detach: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(restPose),
    execute: vi.fn((_motion, signal) => {
      executionSignal = signal!;
      return new Promise<MotionResult>((resolve) => {
        finish = resolve;
      });
    }),
  };
  const actor = createActor(conversationMachine, {
    input: { controller },
  }).start();
  await waitFor(actor, (s) => s.matches("idle"));
  const conversation = actor.getSnapshot().context.current;
  actor.send({ type: "DEV_RESET" });
  expect(controller.reset).not.toHaveBeenCalled();
  actor.send({ type: "OPEN_DEV" });
  actor.send({
    type: "DEV_RUN",
    call: {
      call_id: "move",
      tool_name: "move_avatar",
      arguments: motionExamples[1].motion,
    },
  });
  actor.send({ type: "DEV_RESET" });
  expect(executionSignal.aborted).toBe(true);
  expect(actor.getSnapshot().matches({ dev: "ready" })).toBe(true);
  expect(actor.getSnapshot().context.labPose).toEqual(restPose());
  finish({
    status: "completed",
    pose: restPose(),
    constrained: false,
    duration: 1,
  });
  await Promise.resolve();
  expect(actor.getSnapshot().context.labReport?.receipt.result).toEqual({
    status: "reset",
    pose: restPose(),
  });
  actor.send({ type: "DEV_RESET" });
  expect(controller.reset).toHaveBeenCalledTimes(2);
  expect(actor.getSnapshot().context.current).toBe(conversation);
  expect(fetchMock).not.toHaveBeenCalled();
  actor.stop();
});

it("cancels physical frames on reset and starts the next motion from the restored pose", async () => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) =>
    setTimeout(cb, 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  let actual = restPose();
  const controller = createMotionController();
  controller.attach({
    apply: (pose) => {
      actual = structuredClone(pose);
      return { pose, constrained: false };
    },
    reset: () => {
      actual = restPose();
      return structuredClone(actual);
    },
    dispose: vi.fn(),
  });
  const moving = controller.execute(motionExamples[1].motion);
  await vi.advanceTimersByTimeAsync(400);
  expect(actual).not.toEqual(restPose());
  expect(controller.reset!()).toEqual(restPose());
  expect((await moving).status).toBe("interrupted");
  await vi.advanceTimersByTimeAsync(3000);
  expect(actual).toEqual(restPose());
  expect(controller.pose()).toEqual(actual);
  const next = controller.execute(motionExamples[0].motion);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await next).status).toBe("completed");
  expect(actual.left).toEqual(restPose().left);
});

it("uses the real tool executor without network access and reserves motion ownership", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  let finish!: (result: MotionResult) => void;
  const controller: MotionController = {
    ready: () => true,
    pose: restPose,
    attach: vi.fn(),
    detach: vi.fn(),
    execute: vi.fn(
      () =>
        new Promise<MotionResult>((resolve) => {
          finish = resolve;
        }),
    ),
    stop: vi.fn(() =>
      finish?.({
        status: "interrupted",
        pose: restPose(),
        constrained: false,
        duration: 0.1,
      }),
    ),
  };
  const actor = createActor(conversationMachine, {
    input: { controller },
  }).start();
  await waitFor(actor, (s) => s.matches("idle"));
  const original = actor.getSnapshot().context.current;
  actor.send({ type: "OPEN_DEV" });
  actor.send({ type: "START_LIVE" });
  actor.send({ type: "SEND", content: "Wave" });
  actor.send({ type: "NEW" });
  expect(actor.getSnapshot().matches({ dev: "ready" })).toBe(true);
  expect(actor.getSnapshot().context.current).toBe(original);
  const call = {
    call_id: "direct",
    tool_name: "move_avatar",
    arguments: motionExamples[0].motion,
  };
  actor.send({ type: "DEV_RUN", call });
  actor.send({ type: "DEV_RUN", call });
  expect(controller.execute).toHaveBeenCalledOnce();
  actor.send({ type: "STOP" });
  await waitFor(actor, (s) => s.matches({ dev: "ready" }));
  expect(actor.getSnapshot().context.labReport?.receipt.result).toMatchObject({
    status: "interrupted",
  });
  expect(actor.getSnapshot().context.labReport?.call).toEqual(call);
  expect(fetchMock).not.toHaveBeenCalled();
  actor.send({ type: "CLOSE_DEV" });
  expect(actor.getSnapshot().matches("idle")).toBe(true);
  actor.stop();
});

it("rejects invalid calls, reads actual pose and aborts on close without late result overwrite", async () => {
  let signal!: AbortSignal;
  let finish!: (result: MotionResult) => void;
  const controller: MotionController = {
    ready: () => true,
    pose: restPose,
    attach: vi.fn(),
    detach: vi.fn(),
    stop: vi.fn(),
    execute: vi.fn((_motion, value) => {
      signal = value!;
      return new Promise<MotionResult>((resolve) => {
        finish = resolve;
      });
    }),
  };
  const actor = createActor(conversationMachine, {
    input: { controller },
  }).start();
  await waitFor(actor, (s) => s.matches("idle"));
  actor.send({ type: "OPEN_DEV" });
  actor.send({
    type: "DEV_RUN",
    call: { tool_name: "move_avatar", call_id: "bad", arguments: "{" },
  });
  await waitFor(actor, (s) => s.matches({ dev: "ready" }));
  expect(controller.execute).not.toHaveBeenCalled();
  expect(actor.getSnapshot().context.labReport?.receipt.outcome).toBe("failed");
  actor.send({
    type: "DEV_RUN",
    call: { tool_name: "get_pose", call_id: "pose", arguments: {} },
  });
  await waitFor(actor, (s) => s.matches({ dev: "ready" }));
  expect(actor.getSnapshot().context.labReport?.receipt.result).toEqual({
    pose: restPose(),
  });
  actor.send({
    type: "DEV_RUN",
    call: {
      tool_name: "move_avatar",
      call_id: "move",
      arguments: motionExamples[0].motion,
    },
  });
  actor.send({ type: "CLOSE_DEV" });
  expect(signal.aborted).toBe(true);
  finish({
    status: "completed",
    pose: restPose(),
    constrained: false,
    duration: 1,
  });
  await Promise.resolve();
  expect(actor.getSnapshot().matches("idle")).toBe(true);
  expect(actor.getSnapshot().context.labReport).toBeNull();
  actor.stop();
});

it("previews all examples and exposes speed extensions and invalid edits", () => {
  for (const example of motionExamples) {
    const preview = previewMotion(JSON.stringify(example.motion), restPose());
    expect(preview.error).toBeUndefined();
    expect(preview.planned).toBeGreaterThanOrEqual(preview.requested!);
  }
  const fast = previewMotion(
    JSON.stringify({
      waypoints: [{ time: 0.2, left: { position: [0.29, 0.83, 0.09] } }],
    }),
    restPose(),
  );
  expect(fast.planned).toBeGreaterThan(1.6);
  expect(
    previewMotion('{"waypoints":[{"time":0}]}', restPose()).error,
  ).toContain("time");
  expect(previewMotion("{", restPose()).error).toContain("valid JSON");
  const context = hostContext(createMotionController());
  expect(context.view.data.movement_skill).toContain("name: charlie-motion");
  expect(context.view.data.current_pose).toEqual(restPose());
});

it("measures frame scheduling, speed extension and solver work in physical receipts", async () => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) =>
    setTimeout(cb, 60),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  const controller = createMotionController();
  controller.attach({
    apply: (pose) => ({ pose, constrained: false }),
    dispose: vi.fn(),
  });
  const result = controller.execute({
    waypoints: [{ time: 0.2, head: { yaw: 0.4, nod: 0 } }],
  });
  await vi.advanceTimersByTimeAsync(1100);
  const receipt = await result;
  expect(receipt.constrained).toBe(true);
  expect(receipt.reasons).toContain(
    "Requested timing extended by movement speed limits",
  );
  expect(receipt.timing).toMatchObject({
    requestedSeconds: 0.2,
    firstFrameMs: 60,
    maxFrameGapMs: expect.any(Number),
  });
  expect(receipt.timing!.plannedSeconds).toBeCloseTo(0.9375);
  expect(receipt.timing!.slowFrames).toBe(receipt.timing!.frames);
  expect(receipt.timing!.settlingSeconds).toBeLessThan(0.061);
});
