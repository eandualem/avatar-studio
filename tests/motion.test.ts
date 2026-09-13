import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { solveArm } from "@/lib/ik";
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
describe("reachable and degenerate arm targets", () => {
  it("preserves both segment lengths and reaches targets across the workspace", () => {
    const shoulder = new Vector3(0.107, 0.737, -0.0045),
      pole = new Vector3(0.324, 0.414, 0.063);
    for (const target of [
      new Vector3(0.198, 0.455, 0.022),
      new Vector3(0.29, 0.83, 0.07),
      new Vector3(0.12, 0.65, 0.28),
      shoulder.clone(),
      new Vector3(2, 2, 2),
    ]) {
      const { elbow, wrist } = solveArm(shoulder, target, pole, 0.16, 0.15);
      expect(elbow.distanceTo(shoulder)).toBeCloseTo(0.16, 10);
      expect(wrist.distanceTo(elbow)).toBeCloseTo(0.15, 10);
      expect(wrist.distanceTo(shoulder)).toBeLessThanOrEqual(0.309800001);
      if (
        target.distanceTo(shoulder) > 0.0102 &&
        target.distanceTo(shoulder) < 0.3098
      )
        expect(wrist.distanceTo(target)).toBeLessThan(1e-10);
    }
  });
  it("has a stable fallback when the elbow pole lies along the arm", () => {
    const result = solveArm(
      new Vector3(),
      new Vector3(0, 0.25, 0),
      new Vector3(0, 1, 0),
      0.2,
      0.2,
    );
    expect(result.elbow.toArray().every(Number.isFinite)).toBe(true);
    expect(result.wrist.distanceTo(result.elbow)).toBeCloseTo(0.2, 10);
  });
});
describe("motion composition", () => {
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
