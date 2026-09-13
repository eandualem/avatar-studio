// Use the core entry: upstream only declares a bundler `module` entry at root.
import {
  Joint,
  Link,
  Goal,
  Solver,
  type DOF,
} from "closed-chain-ik/src/core/index.js";
import { Quaternion, Vector3, MathUtils } from "three";

// Upstream's declarations use an ambient const enum; these public axis IDs
// keep its API usable with Next.js isolatedModules without patching the library.
const AXIS = {
  X: 0,
  Y: 1,
  Z: 2,
  EX: 3,
  EY: 4,
  EZ: 5,
} as const satisfies Record<string, DOF>;

export type JointSpec = {
  name: string;
  offset: Vector3;
  axes: DOF[];
  minimum: number[];
  maximum: number[];
  rest: number[];
};
export type JointState = { values: number[][]; velocities: number[][] };
export class LimbChain {
  readonly root = new Link();
  readonly goal = new Goal();
  readonly solver: Solver;
  readonly joints: {
    joint: Joint;
    link: Link;
    spec: JointSpec;
    velocity: number[];
  }[] = [];
  readonly tip: Link;
  constructor(specs: JointSpec[], orientation: boolean) {
    let parent = this.root;
    for (const spec of specs) {
      const joint = new Joint(),
        link = new Link();
      joint.name = spec.name;
      joint.setDoF(...spec.axes);
      joint.setMinLimits(...spec.minimum);
      joint.setMaxLimits(...spec.maximum);
      joint.setDoFValues(...spec.rest);
      joint.setRestPoseValues(...spec.rest);
      joint.restPoseSet = true;
      link.setPosition(...spec.offset.toArray());
      parent.addChild(joint);
      joint.addChild(link);
      parent = link;
      this.joints.push({ joint, link, spec, velocity: spec.axes.map(() => 0) });
    }
    this.tip = parent;
    this.goal.setGoalDoF(
      ...(orientation
        ? [AXIS.X, AXIS.Y, AXIS.Z, AXIS.EX, AXIS.EY, AXIS.EZ]
        : [AXIS.X, AXIS.Y, AXIS.Z]),
    );
    this.goal.makeClosure(this.tip);
    this.solver = new Solver(this.root);
    this.solver.useSVD = false;
    this.solver.maxIterations = 18;
    this.solver.translationConvergeThreshold = 0.0005;
    this.solver.rotationConvergeThreshold = 0.005;
    this.solver.dampingFactor = 0.007;
    this.solver.restPoseFactor = 0.025;
    this.solver.rotationFactor = 0.15;
  }
  anchor(position: Vector3, rotation: Quaternion) {
    this.root.setPosition(...position.toArray());
    this.root.setQuaternion(...rotation.toArray());
  }
  snapshot(): JointState {
    return {
      values: this.joints.map(({ joint, spec }) =>
        spec.axes.map((axis) => Number(joint.getDoFValue(axis))),
      ),
      velocities: this.joints.map((j) => [...j.velocity]),
    };
  }
  restore(state: JointState) {
    this.joints.forEach((entry, i) => {
      entry.joint.setDoFValues(...state.values[i]);
      entry.velocity = [...state.velocities[i]];
    });
  }
  solve(
    position: Vector3,
    rotation: Quaternion | null,
    dt: number,
    immediate = false,
  ) {
    this.goal.setPosition(...position.toArray());
    if (rotation) this.goal.setQuaternion(...rotation.toArray());
    const previous = this.snapshot();
    const status = this.solver.solve();
    let limited = false;
    for (const [i, entry] of this.joints.entries()) {
      const { joint, spec } = entry;
      const values = spec.axes.map((axis, k) => {
        const wanted = MathUtils.clamp(
          Number(joint.getDoFValue(axis)),
          spec.minimum[k],
          spec.maximum[k],
        );
        if (!Number.isFinite(wanted)) return previous.values[i][k];
        if (immediate) {
          entry.velocity[k] = 0;
          return wanted;
        }
        const delta = wanted - previous.values[i][k];
        const desiredVelocity = MathUtils.clamp(delta / dt, -2.1, 2.1);
        const velocity = MathUtils.clamp(
          desiredVelocity,
          previous.velocities[i][k] - 10 * dt,
          previous.velocities[i][k] + 10 * dt,
        );
        const step =
          Math.sign(delta) *
          Math.min(
            Math.abs(delta),
            Math.max(0, Math.sign(delta) * velocity * dt),
          );
        entry.velocity[k] = step / dt;
        limited ||= Math.abs(step - delta) > 0.001;
        return MathUtils.clamp(
          previous.values[i][k] + step,
          spec.minimum[k],
          spec.maximum[k],
        );
      });
      joint.setDoFValues(...values);
    }
    return { status: status.map(Number), limited };
  }
  positions() {
    return this.joints.map(({ link }) => {
      const p: number[] = [];
      link.getWorldPosition(p);
      return new Vector3().fromArray(p);
    });
  }
  rotations() {
    return this.joints.map(({ joint }) => {
      const q: number[] = [];
      // Joint.matrixWorld includes its fixed frame; the child link carries its DoF rotation.
      joint.child.getWorldQuaternion(q);
      return new Quaternion().fromArray(q).normalize();
    });
  }
  diagnostics() {
    return this.joints.flatMap(({ joint, spec }) =>
      spec.axes.map((axis, i) => ({
        joint: spec.name,
        axis: Number(axis),
        value: Number(joint.getDoFValue(axis)),
        min: spec.minimum[i],
        max: spec.maximum[i],
      })),
    );
  }
}

export function armSpecs(
  side: "Left" | "Right",
  upper: Vector3,
  lower: Vector3,
): JointSpec[] {
  const left = side === "Left";
  return [
    {
      name: side + "Arm",
      offset: upper,
      axes: [AXIS.EX, AXIS.EY, AXIS.EZ],
      minimum: [-1.9, -1.45, left ? -1.6 : -1.2],
      maximum: [1.2, 1.45, left ? 1.2 : 1.6],
      rest: [-0.45, left ? -0.2 : 0.2, left ? -1.05 : 1.05],
    },
    {
      name: side + "ForeArm",
      offset: lower,
      axes: [AXIS.EY],
      minimum: [left ? -2.35 : 0.02],
      maximum: [left ? -0.02 : 2.35],
      rest: [left ? -0.6 : 0.6],
    },
  ];
}
export function legSpecs(
  side: "Left" | "Right",
  upper: Vector3,
  lower: Vector3,
): JointSpec[] {
  return [
    {
      name: side + "UpLeg",
      offset: upper,
      axes: [AXIS.EX, AXIS.EY, AXIS.EZ],
      minimum: [-1.7, -0.45, -0.45],
      maximum: [0.45, 0.45, 0.45],
      rest: [-0.08, 0, 0],
    },
    {
      name: side + "Leg",
      offset: lower,
      axes: [AXIS.EX],
      minimum: [0.035],
      maximum: [2.2],
      rest: [0.15],
    },
    {
      name: side + "Foot",
      offset: new Vector3(),
      axes: [AXIS.EX, AXIS.EY, AXIS.EZ],
      minimum: [-0.55, -0.35, -0.3],
      maximum: [0.55, 0.35, 0.3],
      rest: [0, 0, 0],
    },
  ];
}
