import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  createMotionController,
  interpolate,
  planMotion,
  restPose,
} from "@/lib/motion";
import { motionSchema, type Pose } from "@/types/avatar";
import { executeTool } from "@/lib/host-tools";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("motion composition", () => {
  it("repeats only the cycle, resolves omitted channels once, and runs finish once", () => {
    const motion = motionSchema.parse({
      prepare: [{ time: 0.4, head: { yaw: 0.1, nod: 0 } }],
      waypoints: [
        { time: 0.2, head: { yaw: 0.2, nod: 0 } },
        { time: 0.4, head: { yaw: 0.1, nod: 0 } },
      ],
      repeat: 5,
      finish: [{ time: 0.4, head: { yaw: 0, nod: 0 } }],
      interpolation: "swing",
    });
    const plan = planMotion(restPose(), motion);
    expect(plan).toHaveLength(12);
    expect(plan.map((s) => s.cycle)).toEqual([
      null,
      1,
      1,
      2,
      2,
      3,
      3,
      4,
      4,
      5,
      5,
      null,
    ]);
    for (let i = 1; i < plan.length; i++)
      expect(plan[i].from).toEqual(plan[i - 1].to);
    expect(plan.at(-1)!.to.head.yaw).toBe(0);
    expect(
      plan.every(
        (s) => s.to.leftFoot.position[1] === restPose().leftFoot.position[1],
      ),
    ).toBe(true);
    for (const invalid of [0, -1, 1.5, 21, Infinity])
      expect(
        motionSchema.safeParse({ ...motion, repeat: invalid }).success,
      ).toBe(false);
    expect(
      motionSchema.safeParse({
        ...motion,
        prepare: [{ time: 1 }, { time: 0.5 }],
      }).success,
    ).toBe(false);
  });
  it("interrupts a later repetition without running finish or restarting, and reports elapsed cycles", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) =>
      setTimeout(cb, 16),
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const controller = createMotionController(),
      apply = vi.fn((pose: Pose) => ({ pose, constrained: false }));
    controller.attach({ apply, dispose: vi.fn(), reset: restPose });
    const result = controller.execute({
      waypoints: [{ time: 0.2 }, { time: 0.4 }],
      repeat: 5,
      finish: [{ time: 0.2, head: { yaw: 0.1, nod: 0 } }],
    });
    await vi.advanceTimersByTimeAsync(1000);
    controller.reset!();
    expect(await result).toMatchObject({
      status: "interrupted",
      cycles: { requested: 5, elapsed: 2 },
      timing: { requestedSeconds: 2.2 },
    });
    const calls = apply.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(apply.mock.calls).toHaveLength(calls);
    expect(controller.pose()).toEqual(restPose());
    await expect(
      controller.execute({ waypoints: [{ time: 20 }], repeat: 3 }),
    ).rejects.toThrow("too long");
  });
  it("explains identical timing below the hand-direction and travel floors", () => {
    const waypoint = {
      left: {
        position: [0.29, 0.83, 0.09] as [number, number, number],
        direction: [0, 1, 0] as [number, number, number],
      },
    };
    const fast = planMotion(restPose(), {
      waypoints: [{ time: 0.2, ...waypoint }],
    })[0];
    const slower = planMotion(restPose(), {
      waypoints: [{ time: 0.6, ...waypoint }],
    })[0];
    expect(fast.duration).toBeCloseTo(slower.duration);
    expect(fast.duration).toBeCloseTo((Math.PI * 1.875) / 3);
    expect(fast.limits[0].channel).toBe("left hand direction");
    expect(fast.limits.some((l) => l.channel === "left hand travel")).toBe(
      true,
    );
    expect(
      planMotion(restPose(), { waypoints: [{ time: 3, ...waypoint }] })[0]
        .limits,
    ).toEqual([]);
  });
  it("preserves leg and torso channels and limits rotation timing", () => {
    const plan = planMotion(restPose(), {
      waypoints: [
        {
          time: 0.2,
          pelvis: { offset: [-0.085, -0.015, 0], yaw: 0.4 },
          torso: { bend: 0.2, twist: 0, lean: 0 },
          head: { yaw: 0, nod: 0, tilt: 0.2 },
        },
        { time: 0.4, leftFoot: { position: [0.11, 0.2, 0.055] } },
      ],
    });
    expect(plan[0].duration).toBeGreaterThanOrEqual((0.4 * 1.875) / 0.5);
    expect(plan[1].to.pelvis).toEqual(plan[0].to.pelvis);
    expect(plan[1].to.torso).toEqual(plan[0].to.torso);
    expect(plan[1].to.head.tilt).toBe(0.2);
    expect(plan[1].to.rightFoot).toEqual(restPose().rightFoot);
    for (const point of [
      { leftFoot: { position: [0, -1, 0] } },
      { pelvis: { offset: [0, -1, 0], yaw: 0 } },
      { torso: { bend: 2, twist: 0, lean: 0 } },
      { left: { roll: 2 } },
      { shoulders: { left: 2, right: 0 } },
    ])
      expect(
        motionSchema.safeParse({ waypoints: [{ time: 1, ...point }] }).success,
      ).toBe(false);
  });
  it("reports incomplete settling instead of claiming the target was reached", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) =>
      setTimeout(cb, 16),
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const controller = createMotionController(),
      halt = vi.fn();
    controller.attach({
      apply: () => ({ pose: restPose(), constrained: false, settled: false }),
      dispose: vi.fn(),
      halt,
    });
    const result = controller.execute({ waypoints: [{ time: 0.2 }] });
    await vi.advanceTimersByTimeAsync(3300);
    expect(await result).toMatchObject({
      status: "completed",
      constrained: true,
      reasons: ["Movement stopped before the target settled"],
    });
    expect(halt).toHaveBeenCalledOnce();
  });
  it("rejects invalid numbers, reversed times, excess curls and zero directions", () => {
    for (const waypoints of [
      [{ time: 1, left: { position: [Infinity, 1, 0] } }],
      [{ time: 2 }, { time: 1 }],
      [{ time: 1, left: { curls: [0, 0, 2, 0, 0] } }],
      [{ time: 1, right: { direction: [0, 0, 0] } }],
    ])
      expect(motionSchema.safeParse({ waypoints }).success).toBe(false);
  });
  it("preserves untouched channels and slows targets that exceed the speed ceiling", () => {
    const start = restPose();
    const plan = planMotion(
      start,
      motionSchema.parse({
        waypoints: [
          { time: 0.2, left: { position: [0.3, 0.83, 0.08] } },
          { time: 1, head: { yaw: 0.2, nod: 0.1 } },
        ],
      }),
    );
    expect(plan[0].duration).toBeGreaterThan(1);
    expect(plan[1].to.left.position).toEqual([0.3, 0.83, 0.08]);
    expect(plan[1].to.right).toEqual(start.right);
    expect(start.left.position).toEqual([0.198, 0.455, 0.022]);
  });
  it("rotates opposite hand directions without an invalid midpoint", () => {
    const a = restPose(),
      b = restPose();
    b.left.direction = [0, 1, 0];
    const midpoint = interpolate(a, b, 0.5);
    expect(Math.hypot(...midpoint.left.direction)).toBeCloseTo(1);
    expect(midpoint.left.direction.every(Number.isFinite)).toBe(true);
  });
  it("stops at the actual pose and starts replacement motion without snapping to rest", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) =>
      setTimeout(cb, 16),
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const controller = createMotionController();
    let applied: Pose = restPose();
    controller.attach({
      apply: (p) => {
        applied = structuredClone(p);
        return { pose: p, constrained: false };
      },
      dispose: vi.fn(),
    });
    const first = controller.execute({
      waypoints: [{ time: 2, left: { position: [0.3, 0.8, 0.08] } }],
    });
    await vi.advanceTimersByTimeAsync(800);
    const interrupted = structuredClone(applied);
    controller.stop();
    expect((await first).status).toBe("interrupted");
    await vi.advanceTimersByTimeAsync(500);
    expect(applied).toEqual(interrupted);
    const second = controller.execute({
      waypoints: [{ time: 2, left: { position: [0.2, 0.55, 0.12] } }],
    });
    await vi.advanceTimersByTimeAsync(16);
    expect(
      new Vector3(...applied.left.position).distanceTo(
        new Vector3(...interrupted.left.position),
      ),
    ).toBeLessThan(0.0001);
    await vi.advanceTimersByTimeAsync(2100);
    expect((await second).status).toBe("completed");
    expect(applied.left.position).toEqual([0.2, 0.55, 0.12]);
  });
  it("returns failed receipts for invalid model tool calls", async () => {
    const controller = createMotionController();
    const receipt = await executeTool(
      {
        tool_name: "move_avatar",
        call_id: "bad",
        arguments: { waypoints: [{ time: 1, left: { position: [9, 9, 9] } }] },
      },
      controller,
      new AbortController().signal,
    );
    expect(receipt.outcome).toBe("failed");
    expect(controller.pose()).toEqual(restPose());
  });
});
