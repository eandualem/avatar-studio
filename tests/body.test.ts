import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Bone, Vector3 } from "three";
import { createBodyRig } from "@/lib/body/rig";
import { initializeContacts } from "@/lib/body/collision";
import { WRIST_ROLL, WRIST_SWING } from "@/lib/body/wrist";
import { ease, interpolate, planMotion, restPose } from "@/lib/motion";
import { motionExamples } from "@/lib/motion-lab";
import type { Pose } from "@/types/avatar";

beforeAll(initializeContacts);
async function body() {
  const bytes = await readFile("public/avatar/robot.glb");
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  scene.scale.setScalar(1 / 5.56);
  scene.updateMatrixWorld(true);
  const rig = createBodyRig(scene);
  const bones: { bone: Bone; position: Vector3 }[] = [];
  scene.traverse((object) => {
    if (object instanceof Bone)
      bones.push({ bone: object, position: object.position.clone() });
  });
  let pose = rig.apply(restPose()).pose;
  let previous = rig.diagnostics();
  return {
    rig,
    move(change: (target: Pose) => void) {
      const start = structuredClone(pose),
        target = structuredClone(pose);
      change(target);
      const reasons = new Set<string>();
      for (let frame = 1; frame <= 240; frame++) {
        const result = rig.apply(
          interpolate(start, target, ease(frame / 240)),
          1 / 60,
        );
        pose = result.pose;
        result.reasons?.forEach((reason) => reasons.add(reason));
        const actual = rig.diagnostics();
        expect(actual.collision).toBeNull();
        expect(actual.supported).toBe(true);
        expect(
          Math.min(...actual.soles.flat().map((p) => p[1])),
        ).toBeGreaterThanOrEqual(-0.004);
        actual.joints.forEach((joint, i) => {
          expect(Number.isFinite(joint.value)).toBe(true);
          expect(joint.value).toBeGreaterThanOrEqual(joint.min - 1e-6);
          expect(joint.value).toBeLessThanOrEqual(joint.max + 1e-6);
          expect(
            Math.abs(joint.value - previous.joints[i].value),
          ).toBeLessThanOrEqual(2.1 / 60 + 1e-6);
        });
        for (const wrist of actual.wrists) {
          expect(wrist.actualSwing).toBeLessThanOrEqual(WRIST_SWING + 1e-6);
          expect(Math.abs(wrist.roll)).toBeLessThanOrEqual(WRIST_ROLL + 1e-6);
        }
        for (const side of ["left", "right"] as const) {
          expect(pose[side].position.every(Number.isFinite)).toBe(true);
          expect(Math.hypot(...pose[side].direction)).toBeCloseTo(1, 6);
        }
        expect(
          bones.every(
            ({ bone, position }) =>
              bone.quaternion.toArray().every(Number.isFinite) &&
              Math.abs(bone.quaternion.length() - 1) < 1e-5 &&
              (bone.name.endsWith("Hips") ||
                bone.position.distanceTo(position) < 1e-8),
          ),
        ).toBe(true);
        previous = actual;
      }
      return { pose: structuredClone(pose), reasons: [...reasons] };
    },
  };
}
const near = (actual: number[], target: number[], tolerance = 0.008) =>
  expect(
    new Vector3(...actual).distanceTo(new Vector3(...target)),
  ).toBeLessThan(tolerance);

describe("constrained motion on the shipped skeleton", () => {
  it.each(motionExamples)(
    "executes the Dev test example $name at its planned timing",
    async ({ motion }) => {
      const b = await body();
      const plan = planMotion(b.rig.apply(restPose()).pose, motion);
      const duration = plan.at(-1)!.start + plan.at(-1)!.duration;
      let actual = b.rig.apply(restPose());
      for (let frame = 1; frame <= Math.ceil((duration + 3) * 60); frame++) {
        const time = frame / 60;
        const segment =
          plan.find((s) => time < s.start + s.duration) ?? plan.at(-1)!;
        actual = b.rig.apply(
          interpolate(
            segment.from,
            segment.to,
            ease(
              Math.min(
                1,
                Math.max(0, (time - segment.start) / segment.duration),
              ),
            ),
          ),
          1 / 60,
        );
        const diagnostics = b.rig.diagnostics();
        expect(diagnostics.collision).toBeNull();
        expect(diagnostics.supported).toBe(true);
        if (time >= duration && actual.settled !== false) break;
      }
      const target = plan.at(-1)!.to;
      near(actual.pose.left.position, target.left.position, 0.015);
      near(actual.pose.right.position, target.right.position, 0.015);
      near(actual.pose.pelvis.offset, target.pelvis.offset, 0.015);
      expect(actual.pose.head).toEqual(target.head);
    },
  );
  it("crouches with bent knees and flat planted boots, then stands again", async () => {
    const b = await body();
    const crouch = b.move((p) => {
      p.pelvis.offset = [0, -0.07, -0.055];
      p.torso.bend = 0.2;
    });
    near(crouch.pose.pelvis.offset, [0, -0.07, -0.055]);
    near(crouch.pose.leftFoot.position, restPose().leftFoot.position);
    near(crouch.pose.rightFoot.position, restPose().rightFoot.position);
    expect(crouch.pose.torso.bend).toBeCloseTo(0.2);
    for (const joint of b.rig
      .diagnostics()
      .joints.filter((j) => /^(Left|Right)Leg$/.test(j.joint)))
      expect(joint.value).toBeGreaterThan(0.8);
    const standing = b.move((p) => {
      p.pelvis.offset = [0, 0, 0];
      p.torso.bend = 0;
    });
    near(standing.pose.pelvis.offset, [0, 0, 0]);
  });
  it("lifts either leg after a weight shift and returns to standing", async () => {
    const b = await body();
    for (const side of ["leftFoot", "rightFoot"] as const) {
      const sign = side === "leftFoot" ? 1 : -1;
      b.move((p) => {
        p.pelvis.offset = [-sign * 0.085, -0.015, 0];
      });
      const lifted = b.move((p) => {
        p[side].position = [sign * 0.11, 0.2, 0.055];
      });
      near(lifted.pose[side].position, [sign * 0.11, 0.2, 0.055]);
      const turned = b.move((p) => {
        p[side].yaw = 0.12;
        p[side].pitch = 0.1;
      });
      expect(turned.pose[side].yaw).toBeCloseTo(0.12, 1);
      expect(turned.pose[side].pitch).toBeCloseTo(0.1, 1);
      b.move((p) => {
        p[side] = restPose()[side];
      });
      const centered = b.move((p) => {
        p.pelvis.offset = [0, 0, 0];
      });
      near(centered.pose.pelvis.offset, [0, 0, 0]);
    }
  });
  it("blocks unsupported leg lifts and torso crossings, then accepts a safe target", async () => {
    const b = await body();
    const unsupported = b.move((p) => {
      p.leftFoot.position = [0.11, 0.22, 0.06];
    });
    expect(unsupported.reasons).toContain(
      "weight must remain over a planted foot",
    );
    expect(unsupported.pose.leftFoot.position[1]).toBeLessThan(0.12);
    b.move((p) => {
      p.leftFoot = restPose().leftFoot;
    });
    const crossing = b.move((p) => {
      p.left.position = [0, 0.68, 0];
    });
    expect(crossing.reasons.some((r) => r.includes("intersect"))).toBe(true);
    expect(crossing.pose.left.position[0]).toBeGreaterThan(0.08);
    const recovered = b.move((p) => {
      p.left = restPose().left;
    });
    near(recovered.pose.left.position, restPose().left.position);
  });
  it("raises hands without elbow reversal or wrist flips and moves the upper body", async () => {
    const b = await body();
    const raised = b.move((p) => {
      p.left.position = [0.29, 0.83, 0.09];
      p.left.direction = [0, 1, 0];
      p.left.roll = 0.6;
      p.head = { yaw: -0.2, nod: -0.1, tilt: 0.1 };
    });
    near(raised.pose.left.position, [0.29, 0.83, 0.09]);
    expect(raised.pose.head).toEqual({ yaw: -0.2, nod: -0.1, tilt: 0.1 });
    const changed = b.move((p) => {
      p.left.direction = [0, -1, 0];
      p.left.roll = -0.6;
      p.left.curls = [1, 0, 1, 1, 1];
      p.shoulders = { left: 0.1, right: 0.1 };
      p.torso.twist = 0.12;
    });
    expect(changed.pose.left.curls).toEqual([1, 0, 1, 1, 1]);
    expect(changed.pose.shoulders).toEqual({ left: 0.1, right: 0.1 });
    expect(changed.pose.torso.twist).toBeCloseTo(0.12);
    b.move((p) => {
      p.left = restPose().left;
      p.shoulders = restPose().shoulders;
    });
    const bodyTurn = b.move((p) => {
      p.pelvis.yaw = 0.1;
      p.torso.lean = 0.05;
    });
    expect(bodyTurn.pose.pelvis.yaw).toBeCloseTo(0.1);
    expect(bodyTurn.pose.torso.lean).toBeCloseTo(0.05);
  });
});
