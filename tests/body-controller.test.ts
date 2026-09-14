import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BodyController,
  type BodyAction,
  type BodyTransport,
} from "@/lib/body-controller";
import { createMotionController, restPose } from "@/lib/motion";
import type { MotionController, MotionResult } from "@/types/avatar";
import type { Message, Pending } from "@/types/conversation";

const move = (intent = "explicit", call_id = "move"): Pending => ({
  tool_name: "move_avatar",
  call_id,
  arguments: {
    intent,
    label: "wave",
    waypoints: [{ time: 0.2, head: { yaw: 0.1, nod: 0 } }],
  },
});
const user = (content: string, id = "u1"): Message => ({
  id,
  role: "user",
  content,
});
const result: MotionResult = {
  status: "completed",
  pose: restPose(),
  duration: 1,
  constrained: false,
};
function setup() {
  const motion: MotionController = {
    attach: vi.fn(),
    detach: vi.fn(),
    pose: restPose,
    ready: () => true,
    stop: vi.fn(),
    execute: vi.fn(async (_m, _s, started) => {
      started?.();
      return result;
    }),
  };
  const transport: BodyTransport = {
    decide: vi.fn(async () => move()),
    receipt: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  const fact = vi.fn<(action: BodyAction) => void>(),
    warning = vi.fn();
  const body = new BodyController(motion, transport, vi.fn(), fact, warning);
  return { body, motion, transport, fact, warning };
}
beforeEach(() =>
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] }),
);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("independent body scheduling", () => {
  it("coalesces fragments and includes ordered history only through the user", async () => {
    const { body, transport, motion } = setup();
    body.observe([user("Can you")]);
    await vi.advanceTimersByTimeAsync(500);
    body.observe([user("Can you wave?")]);
    await vi.advanceTimersByTimeAsync(500);
    expect(transport.decide).not.toHaveBeenCalled();
    body.observe([
      user("Can you wave?"),
      { id: "a", role: "assistant", content: "Sure" },
    ]);
    await vi.advanceTimersByTimeAsync(400);
    expect(transport.decide).toHaveBeenCalledOnce();
    const [request] = vi.mocked(transport.decide).mock.calls[0];
    expect(request.host_context.view.data.conversation).toEqual([
      user("Can you wave?"),
    ]);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(transport.receipt).toHaveBeenCalledOnce();
    expect(body.snapshot().actions[0]).toMatchObject({
      status: "completed",
      requestedAt: 1400,
      startedAt: 1400,
    });
  });
  it("greetings and ordinary questions independently request decisions", async () => {
    const { body, transport } = setup();
    vi.mocked(transport.decide).mockResolvedValue(null);
    body.observe([user("Hello!")]);
    await vi.advanceTimersByTimeAsync(900);
    body.observe([
      user("Hello!"),
      { id: "a", role: "assistant", content: "Hi" },
      user("Why is the sky blue?", "u2"),
    ]);
    await vi.advanceTimersByTimeAsync(900);
    expect(transport.decide).toHaveBeenCalledTimes(2);
    expect(vi.mocked(transport.decide).mock.calls[0][0].session_id).not.toBe(
      vi.mocked(transport.decide).mock.calls[1][0].session_id,
    );
    expect(transport.receipt).not.toHaveBeenCalled();
  });
  it("replay, assistant speech, late fragments of an admitted utterance and snapshots never repeat movement", async () => {
    const { body, motion, transport } = setup();
    body.observe([user("Wave")]);
    await vi.advanceTimersByTimeAsync(900);
    body.observe([user("Wave")]);
    body.observe([user("Wave please")]);
    body.observe([
      user("Wave please"),
      { id: "a", role: "assistant", content: "Waving" },
    ]);
    body.reconcile([user("Wave please"), user("Old recovered request", "u2")]);
    body.observe([user("Wave please"), user("Old recovered request", "u2")]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(transport.decide).toHaveBeenCalledOnce();
  });
  it.each(["stop", "close", "correction", "snapshot"])(
    "rejects a late model result after %s",
    async (kind) => {
      const { body, motion, transport } = setup();
      let resolve!: (pending: Pending) => void;
      vi.mocked(transport.decide).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      body.observe([user("Wave")]);
      await vi.advanceTimersByTimeAsync(900);
      if (kind === "stop") body.stop();
      if (kind === "close") body.close();
      if (kind === "correction") body.observe([user("Actually stay still")]);
      if (kind === "snapshot") body.reconcile([user("Wave")]);
      resolve(move());
      await vi.advanceTimersByTimeAsync(0);
      expect(motion.execute).not.toHaveBeenCalled();
      expect(transport.cancel).toHaveBeenCalledOnce();
      expect(transport.receipt).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        {
          outcome: "failed",
          result: expect.objectContaining({
            status: "canceled",
            executed: false,
          }),
        },
      );
      body.close();
    },
  );
  it("preserves an explicit action during conversation and rejects incidental replacement", async () => {
    const { body, motion, transport } = setup();
    vi.mocked(motion.execute).mockImplementationOnce((_m, _s, started) => {
      started?.();
      return new Promise(() => {});
    });
    body.observe([user("Run")]);
    await vi.advanceTimersByTimeAsync(900);
    const stops = vi.mocked(motion.stop).mock.calls.length;
    vi.mocked(transport.decide).mockResolvedValueOnce(
      move("incidental", "think"),
    );
    body.observe([user("Tell me a joke", "u2")]);
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(vi.mocked(motion.stop).mock.calls).toHaveLength(stops);
    expect(body.snapshot().active?.status).toBe("ongoing");
    body.close();
  });
  it("an explicit replacement cancels the prior action and stop blocks subsequent incidental motion", async () => {
    const { body, motion, transport, fact } = setup();
    vi.mocked(motion.execute).mockImplementationOnce((_m, signal, started) => {
      started?.();
      return new Promise((resolve) =>
        signal?.addEventListener("abort", () =>
          resolve({ ...result, status: "interrupted" }),
        ),
      );
    });
    body.observe([user("Run")]);
    await vi.advanceTimersByTimeAsync(900);
    body.observe([user("Wave instead", "u2")]);
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    expect(fact.mock.calls.map(([a]) => a.status)).toContain("canceled");
    body.stop();
    vi.mocked(transport.decide).mockResolvedValueOnce(move("incidental"));
    body.observe([user("Hello", "u3")]);
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    body.observe([user("Wave again", "u4")]);
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).toHaveBeenCalledTimes(3);
    expect(body.snapshot().still).toBe(false);
  });
  it("unambiguous spoken stop works immediately and does not treat don't stop as cancellation", async () => {
    const { body, transport } = setup();
    body.observe([user("Stop moving!")]);
    expect(body.snapshot().still).toBe(true);
    await vi.advanceTimersByTimeAsync(900);
    expect(transport.decide).not.toHaveBeenCalled();
    body.observe([user("Don't stop running", "u2")]);
    await vi.advanceTimersByTimeAsync(900);
    expect(transport.decide).toHaveBeenCalledOnce();
  });
  it("rejects invalid or unsupported tools and records failure without narration", async () => {
    const { body, motion, transport, warning } = setup();
    vi.mocked(transport.decide).mockResolvedValueOnce({
      ...move(),
      tool_name: "shell",
    });
    body.observe([user("Wave")]);
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).not.toHaveBeenCalled();
    expect(body.snapshot().actions[0].status).toBe("failed");
    expect(warning).toHaveBeenCalledOnce();
    expect(transport.receipt).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ outcome: "failed" }),
    );
  });
  it("lost receipt acknowledgments never repeat movement or turn completion into failure", async () => {
    const { body, transport, motion, warning } = setup();
    vi.mocked(transport.receipt).mockRejectedValue(new Error("lost"));
    body.observe([user("Wave")]);
    await vi.advanceTimersByTimeAsync(900);
    body.observe([user("Wave")]);
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(transport.receipt).toHaveBeenCalledOnce();
    expect(body.snapshot().actions[0].status).toBe("completed");
    expect(warning).toHaveBeenCalledOnce();
  });
  it("emits started only after the actual engine applies a frame, with no start after pre-frame cancel", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) =>
      setTimeout(fn, 16),
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const controller = createMotionController();
    const apply = vi.fn((pose) => ({ pose, constrained: false }));
    controller.attach({ apply, dispose: vi.fn() });
    const started = vi.fn();
    const first = controller.execute(
      { waypoints: [{ time: 0.2 }] },
      undefined,
      started,
    );
    expect(started).not.toHaveBeenCalled();
    controller.stop();
    expect((await first).status).toBe("interrupted");
    await vi.advanceTimersByTimeAsync(20);
    expect(started).not.toHaveBeenCalled();
    const second = controller.execute(
      { waypoints: [{ time: 0.2 }] },
      undefined,
      () => {
        expect(apply.mock.calls.length).toBeGreaterThan(1);
        started();
      },
    );
    await vi.advanceTimersByTimeAsync(16);
    expect(started).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(220);
    expect((await second).status).toBe("completed");
  });
});

it("keeps requested stillness across call reconstruction without treating ordinary hangup as a hold request", async () => {
  const { body, motion, transport } = setup();
  body.close();
  expect(body.snapshot().still).toBe(false);
  const held = new BodyController(
    motion,
    transport,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    900,
    true,
  );
  vi.mocked(transport.decide).mockResolvedValueOnce(move("incidental"));
  held.observe([user("Hello!")]);
  await vi.advanceTimersByTimeAsync(900);
  expect(motion.execute).not.toHaveBeenCalled();
  held.close();
  expect(held.snapshot().still).toBe(true);
});

it("cancels the isolated backend decision when its response is unknown or times out", async () => {
  const { body, motion, transport } = setup();
  vi.mocked(transport.decide).mockRejectedValueOnce(
    new Error("request timeout"),
  );
  body.observe([user("Wave")]);
  await vi.advanceTimersByTimeAsync(900);
  expect(transport.cancel).toHaveBeenCalledWith(
    vi.mocked(transport.decide).mock.calls[0][0].session_id,
    expect.any(String),
  );
  expect(transport.receipt).not.toHaveBeenCalled();
  expect(motion.execute).not.toHaveBeenCalled();
  expect(body.snapshot().actions[0].status).toBe("failed");
});
