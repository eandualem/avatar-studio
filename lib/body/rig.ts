import {
  Bone,
  Box3,
  Euler,
  MathUtils,
  Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from "three";
import type { Pose, RigDriver } from "@/types/avatar";
import { restPose } from "@/lib/motion";
import { LimbChain, armSpecs, legSpecs } from "./chain";
import { bodyContacts, supported } from "./collision";
import { constrainWrist, WRIST_SWING } from "./wrist";

export function createBodyRig(model: Object3D) {
  const bones = new Map<string, Bone>();
  model.traverse((object) => {
    if (object instanceof Bone)
      bones.set(object.name.replace("mixamorig", "").replace(":", ""), object);
  });
  const bone = (name: string) => {
    const b = bones.get(name);
    if (!b) throw new Error("Missing body bone: " + name);
    return b;
  };
  const position = (name: string) => bone(name).getWorldPosition(new Vector3());
  const rest = new Map(
    [...bones.values()].map((b) => [
      b,
      {
        position: b.position.clone(),
        local: b.quaternion.clone(),
        world: b.getWorldQuaternion(new Quaternion()),
        origin: b.getWorldPosition(new Vector3()),
      },
    ]),
  );
  const worldRotation = (b: Bone, q: Quaternion) => {
    b.quaternion.copy(
      b.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(q),
    );
    b.updateMatrixWorld(true);
  };
  const deltaRotation = (name: string, q: Quaternion) => {
    const b = bone(name),
      r = rest.get(b)!;
    b.quaternion
      .copy(r.local)
      .multiply(r.world.clone().invert().multiply(q).multiply(r.world));
    b.updateMatrixWorld(true);
  };
  const arms = (["Left", "Right"] as const).map((side) => ({
    side,
    channel: side === "Left" ? ("left" as const) : ("right" as const),
    chain: new LimbChain(
      armSpecs(
        side,
        position(side + "ForeArm").sub(position(side + "Arm")),
        position(side + "Hand").sub(position(side + "ForeArm")),
      ),
      false,
    ),
    handDirection: position(side + "HandMiddle1")
      .sub(position(side + "Hand"))
      .normalize(),
    wrist: new Quaternion(),
  }));
  const legs = (["Left", "Right"] as const).map((side) => ({
    side,
    channel: side === "Left" ? ("leftFoot" as const) : ("rightFoot" as const),
    chain: new LimbChain(
      legSpecs(
        side,
        position(side + "Leg").sub(position(side + "UpLeg")),
        position(side + "Foot").sub(position(side + "Leg")),
      ),
      true,
    ),
    sole: [] as Vector3[],
  }));
  for (const leg of legs) {
    const bounds = new Box3();
    model.traverse((object) => {
      if (!(object instanceof SkinnedMesh)) return;
      const index = object.geometry.getAttribute("skinIndex").getX(0);
      if (object.skeleton.bones[index] === bone(leg.side + "Foot"))
        bounds.union(new Box3().setFromObject(object));
    });
    if (bounds.isEmpty())
      throw new Error("Missing boot geometry for " + leg.side);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const z of [bounds.min.z, bounds.max.z])
        leg.sole.push(
          bone(leg.side + "Foot").worldToLocal(new Vector3(x, bounds.min.y, z)),
        );
  }
  const soles = () =>
    legs.map((leg) =>
      leg.sole.map((p) =>
        p.clone().applyMatrix4(bone(leg.side + "Foot").matrixWorld),
      ),
    );
  const massCenter = () =>
    position("Spine1")
      .multiplyScalar(0.4)
      .addScaledVector(position("Hips"), 0.2)
      .addScaledVector(position("Head"), 0.12)
      .addScaledVector(position("LeftArm"), 0.07)
      .addScaledVector(position("RightArm"), 0.07)
      .addScaledVector(position("LeftUpLeg"), 0.07)
      .addScaledVector(position("RightUpLeg"), 0.07);
  let current = restPose();
  let ready = false;
  const copyChain = (chain: LimbChain) =>
    chain.rotations().forEach((q, i) => {
      const b = bone(chain.joints[i].spec.name);
      worldRotation(b, q.multiply(rest.get(b)!.world));
    });
  const apply: RigDriver["apply"] = (requested, elapsed = 1 / 60) => {
    const dt = MathUtils.clamp(elapsed, 0.001, 1 / 30),
      reasons: string[] = [];
    let limited = false;
    const previousTransforms = [...bones.values()].map((b) => ({
      b,
      p: b.position.clone(),
      q: b.quaternion.clone(),
    }));
    const previousChains = [...arms, ...legs].map((l) => l.chain.snapshot()),
      previousWrists = arms.map((a) => a.wrist.clone());
    const pose = structuredClone(requested);
    const step = (a: number, b: number, rate: number) => {
      const value = ready
        ? MathUtils.clamp(b, a - rate * dt, a + rate * dt)
        : b;
      limited ||= Math.abs(value - b) > 0.0001;
      return value;
    };
    pose.pelvis.offset = pose.pelvis.offset.map((v, i) =>
      step(current.pelvis.offset[i], v, 0.12),
    ) as Pose["pelvis"]["offset"];
    pose.pelvis.yaw = step(current.pelvis.yaw, pose.pelvis.yaw, 0.5);
    for (const key of ["bend", "twist", "lean"] as const)
      pose.torso[key] = step(current.torso[key], pose.torso[key], 0.5);
    for (const key of ["yaw", "nod", "tilt"] as const)
      pose.head[key] = step(current.head[key], pose.head[key], 0.8);
    for (const side of ["left", "right"] as const) {
      pose.shoulders[side] = step(
        current.shoulders[side],
        pose.shoulders[side],
        0.5,
      );
      pose[side].curls = pose[side].curls.map((v, i) =>
        step(current[side].curls[i], v, 2),
      ) as Pose["left"]["curls"];
    }
    for (const [b, r] of rest) {
      b.position.copy(r.position);
      b.quaternion.copy(r.local);
    }
    model.updateMatrixWorld(true);
    const hips = bone("Hips");
    hips.position.copy(
      hips.parent!.worldToLocal(
        rest
          .get(hips)!
          .origin.clone()
          .add(new Vector3(...pose.pelvis.offset)),
      ),
    );
    worldRotation(
      hips,
      new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), pose.pelvis.yaw)
        .multiply(rest.get(hips)!.world),
    );
    for (const name of ["Spine", "Spine1", "Spine2"])
      deltaRotation(
        name,
        new Quaternion().setFromEuler(
          new Euler(
            pose.torso.bend / 3,
            pose.torso.twist / 3,
            pose.torso.lean / 3,
          ),
        ),
      );
    for (const arm of arms) {
      const lift = MathUtils.clamp(
        pose.shoulders[arm.channel] +
          Math.max(0, pose[arm.channel].position[1] - 0.73) * 0.45,
        -0.1,
        0.25,
      );
      deltaRotation(
        arm.side + "Shoulder",
        new Quaternion().setFromAxisAngle(
          new Vector3(0, 0, 1),
          arm.side === "Left" ? lift : -lift,
        ),
      );
    }
    for (const leg of legs) {
      const root = bone(leg.side + "UpLeg"),
        parent = root.parent!;
      const parentDelta = parent.getWorldQuaternion(new Quaternion()).multiply(
        rest
          .get(parent as Bone)!
          .world.clone()
          .invert(),
      );
      leg.chain.anchor(position(leg.side + "UpLeg"), parentDelta);
      const foot = pose[leg.channel];
      const rotation = new Quaternion().setFromEuler(
        new Euler(foot.pitch, foot.yaw, 0),
      );
      const solved = leg.chain.solve(
        new Vector3(...foot.position),
        rotation,
        dt,
        !ready,
      );
      limited ||= solved.limited;
      copyChain(leg.chain);
      foot.position = position(leg.side + "Foot").toArray();
      const actual = new Euler().setFromQuaternion(
        leg.chain.rotations().at(-1)!,
      );
      foot.pitch = actual.x;
      foot.yaw = actual.y;
    }
    for (const arm of arms) {
      const root = bone(arm.side + "Arm"),
        parent = root.parent!;
      const parentDelta = parent.getWorldQuaternion(new Quaternion()).multiply(
        rest
          .get(parent as Bone)!
          .world.clone()
          .invert(),
      );
      arm.chain.anchor(position(arm.side + "Arm"), parentDelta);
      const hand = pose[arm.channel];
      const solved = arm.chain.solve(
        new Vector3(...hand.position),
        null,
        dt,
        !ready,
      );
      limited ||= solved.limited;
      copyChain(arm.chain);
      hand.position = position(arm.side + "Hand").toArray();
      const foreRotation = arm.chain.rotations()[1];
      const desired = new Vector3(...hand.direction)
        .normalize()
        .applyQuaternion(foreRotation.clone().invert());
      const swing = new Quaternion().setFromUnitVectors(
        arm.handDirection,
        desired,
      );
      const angle = 2 * Math.acos(Math.min(1, Math.abs(swing.w))),
        limit = WRIST_SWING;
      if (angle > limit) {
        swing
          .identity()
          .slerp(
            new Quaternion().setFromUnitVectors(arm.handDirection, desired),
            limit / angle,
          );
        reasons.push("wrist swing limited");
      }
      const target = swing.multiply(
        new Quaternion().setFromAxisAngle(arm.handDirection, hand.roll),
      );
      if (ready) arm.wrist.rotateTowards(target, 2 * dt);
      else arm.wrist.copy(target);
      const wristAngles = constrainWrist(arm.wrist, arm.handDirection);
      limited ||= arm.wrist.angleTo(target) > 0.002;
      const handRotation = foreRotation.clone().multiply(arm.wrist);
      worldRotation(
        bone(arm.side + "Hand"),
        handRotation.clone().multiply(rest.get(bone(arm.side + "Hand"))!.world),
      );
      hand.direction = arm.handDirection
        .clone()
        .applyQuaternion(handRotation)
        .normalize()
        .toArray();
      hand.roll = wristAngles.roll;
      const sign = arm.side === "Left" ? 1 : -1;
      for (const [i, digit] of [
        "Thumb",
        "Index",
        "Middle",
        "Ring",
        "Pinky",
      ].entries())
        for (let segment = 1; segment <= 3; segment++) {
          const p = bone(arm.side + "Hand" + digit + segment),
            r = rest.get(p)!;
          const axis = new Vector3(0, 0, -sign).applyQuaternion(
            r.world.clone().invert(),
          );
          const degrees = (digit === "Thumb" ? [25, 45, 35] : [65, 80, 45])[
            segment - 1
          ];
          p.quaternion
            .copy(r.local)
            .multiply(
              new Quaternion().setFromAxisAngle(
                axis,
                hand.curls[i] * MathUtils.degToRad(degrees),
              ),
            );
        }
    }
    deltaRotation(
      "Neck",
      new Quaternion().setFromEuler(
        new Euler(
          pose.head.nod * 0.35,
          pose.head.yaw * 0.35,
          pose.head.tilt * 0.35,
        ),
      ),
    );
    deltaRotation(
      "Head",
      new Quaternion().setFromEuler(
        new Euler(
          pose.head.nod * 0.65,
          pose.head.yaw * 0.65,
          pose.head.tilt * 0.65,
        ),
      ),
    );
    model.updateMatrixWorld(true);
    const solePoints = soles();
    const violation =
      bodyContacts(position) ||
      (Math.min(...solePoints.flat().map((p) => p.y)) < -0.004
        ? "foot would pass through the floor"
        : null) ||
      (!supported(massCenter(), solePoints)
        ? "weight must remain over a planted foot"
        : null);
    if (ready && violation) {
      for (const { b, p, q } of previousTransforms) {
        b.position.copy(p);
        b.quaternion.copy(q);
      }
      [...arms, ...legs].forEach((l, i) => l.chain.restore(previousChains[i]));
      arms.forEach((a, i) => a.wrist.copy(previousWrists[i]));
      model.updateMatrixWorld(true);
      return {
        pose: structuredClone(current),
        constrained: true,
        settled: true,
        reasons: [violation],
      };
    }
    for (const key of ["left", "right", "leftFoot", "rightFoot"] as const)
      if (
        !limited &&
        new Vector3(...pose[key].position).distanceTo(
          new Vector3(...requested[key].position),
        ) > 0.008
      )
        reasons.push(key + " target constrained by joint limits");
    current = pose;
    return {
      pose: structuredClone(pose),
      constrained: reasons.length > 0,
      settled: !limited,
      reasons: [...new Set(reasons)],
    };
  };
  for (let i = 0; i < 12; i++) apply(restPose());
  if (
    bodyContacts(position) ||
    !supported(massCenter(), soles()) ||
    Math.min(
      ...soles()
        .flat()
        .map((p) => p.y),
    ) < -0.004
  )
    throw new Error("The initial body pose violates its movement constraints.");
  ready = true;
  // Manual test reset restores the already-validated starting state directly.
  const initialPose = structuredClone(current);
  const initialTransforms = [...bones.values()].map((b) => ({
    b,
    p: b.position.clone(),
    q: b.quaternion.clone(),
  }));
  const initialChains = [...arms, ...legs].map((l) => l.chain.snapshot());
  const initialWrists = arms.map((a) => a.wrist.clone());
  return {
    apply,
    reset: () => {
      for (const { b, p, q } of initialTransforms) {
        b.position.copy(p);
        b.quaternion.copy(q);
      }
      [...arms, ...legs].forEach((l, i) => l.chain.restore(initialChains[i]));
      arms.forEach((a, i) => a.wrist.copy(initialWrists[i]));
      current = structuredClone(initialPose);
      model.updateMatrixWorld(true);
      return structuredClone(current);
    },
    halt: () => {
      for (const limb of [...arms, ...legs])
        for (const joint of limb.chain.joints) joint.velocity.fill(0);
    },
    diagnostics: () => ({
      joints: [...arms, ...legs].flatMap((l) => l.chain.diagnostics()),
      wrists: arms.map((arm) => ({
        side: arm.side,
        roll:
          2 *
          Math.atan2(
            new Vector3(arm.wrist.x, arm.wrist.y, arm.wrist.z).dot(
              arm.handDirection,
            ),
            arm.wrist.w,
          ),
        actualSwing: arm.handDirection.angleTo(
          arm.handDirection.clone().applyQuaternion(arm.wrist),
        ),
      })),
      soles: soles().map((c) => c.map((p) => p.toArray())),
      collision: bodyContacts(position),
      supported: supported(massCenter(), soles()),
    }),
  };
}
