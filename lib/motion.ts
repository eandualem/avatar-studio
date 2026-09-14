import { Vector3 } from "three";
import type {
  Motion,
  MotionController,
  MotionResult,
  Pose,
  RigDriver,
  Vec3,
} from "@/types/avatar";

export const restPose = (): Pose => ({
  left: {
    position: [0.198, 0.455, 0.022],
    direction: [0, -1, 0],
    curls: [0, 0.12, 0.12, 0.12, 0.12],
    roll: 0,
  },
  right: {
    position: [-0.198, 0.455, 0.022],
    direction: [0, -1, 0],
    curls: [0, 0.12, 0.12, 0.12, 0.12],
    roll: 0,
  },
  leftFoot: { position: [0.1043, 0.0871, -0.0035], yaw: 0, pitch: 0 },
  rightFoot: { position: [-0.1043, 0.0871, -0.0035], yaw: 0, pitch: 0 },
  pelvis: { offset: [0, 0, 0], yaw: 0 },
  torso: { bend: 0, twist: 0, lean: 0 },
  shoulders: { left: 0, right: 0 },
  head: { yaw: 0, nod: 0, tilt: 0 },
});
export const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function interpolate(a: Pose, b: Pose, t: number): Pose {
  const pose = structuredClone(a);
  for (const side of ["left", "right"] as const) {
    pose[side].position = a[side].position.map((v, i) =>
      lerp(v, b[side].position[i], t),
    ) as Vec3;
    const start = new Vector3(...a[side].direction).normalize();
    const end = new Vector3(...b[side].direction).normalize();
    // Spherical interpolation also handles opposite directions without a zero vector.
    const axis = start.clone().cross(end);
    if (axis.lengthSq() < 1e-10)
      axis
        .copy(start)
        .cross(
          Math.abs(start.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0),
        );
    pose[side].direction = start
      .applyAxisAngle(
        axis.normalize(),
        Math.acos(Math.max(-1, Math.min(1, start.dot(end)))) * t,
      )
      .toArray();
    pose[side].curls = a[side].curls.map((v, i) =>
      lerp(v, b[side].curls[i], t),
    ) as Pose["left"]["curls"];
    pose[side].roll = lerp(a[side].roll, b[side].roll, t);
  }
  for (const side of ["leftFoot", "rightFoot"] as const) {
    pose[side].position = a[side].position.map((v, i) =>
      lerp(v, b[side].position[i], t),
    ) as Vec3;
    pose[side].yaw = lerp(a[side].yaw, b[side].yaw, t);
    pose[side].pitch = lerp(a[side].pitch, b[side].pitch, t);
  }
  pose.pelvis.offset = a.pelvis.offset.map((v, i) =>
    lerp(v, b.pelvis.offset[i], t),
  ) as Vec3;
  pose.pelvis.yaw = lerp(a.pelvis.yaw, b.pelvis.yaw, t);
  for (const key of ["bend", "twist", "lean"] as const)
    pose.torso[key] = lerp(a.torso[key], b.torso[key], t);
  for (const side of ["left", "right"] as const)
    pose.shoulders[side] = lerp(a.shoulders[side], b.shoulders[side], t);
  pose.head = {
    yaw: lerp(a.head.yaw, b.head.yaw, t),
    nod: lerp(a.head.nod, b.head.nod, t),
    tilt: lerp(a.head.tilt, b.head.tilt, t),
  };
  return pose;
}

export function planMotion(start: Pose, motion: Motion) {
  let previous = structuredClone(start),
    requestedTime = 0,
    elapsed = 0;
  return motion.waypoints.map((point) => {
    const next = structuredClone(previous);
    for (const side of ["left", "right"] as const)
      Object.assign(next[side], point[side]);
    for (const side of ["leftFoot", "rightFoot"] as const)
      Object.assign(next[side], point[side]);
    if (point.pelvis) next.pelvis = point.pelvis;
    if (point.torso) next.torso = point.torso;
    if (point.shoulders) next.shoulders = point.shoulders;
    if (point.head) Object.assign(next.head, point.head);
    const distance = Math.max(
      ...(["left", "right"] as const).map((s) =>
        new Vector3(...previous[s].position).distanceTo(
          new Vector3(...next[s].position),
        ),
      ),
    );
    const turn = Math.max(
      Math.abs(next.head.yaw - previous.head.yaw),
      Math.abs(next.head.nod - previous.head.nod),
      Math.abs(next.head.tilt - previous.head.tilt),
    );
    const finger = Math.max(
      ...(["left", "right"] as const).flatMap((s) =>
        next[s].curls.map((v, i) => Math.abs(v - previous[s].curls[i])),
      ),
    );
    const directionAngle = Math.max(
      ...(["left", "right"] as const).map((s) =>
        new Vector3(...previous[s].direction).angleTo(
          new Vector3(...next[s].direction),
        ),
      ),
    );
    const duration = Math.max(
      point.time - requestedTime,
      (distance * 1.875) / 0.45,
      (turn * 1.875) / 0.8,
      (finger * 1.875) / 2,
      (directionAngle * 1.875) / 3,
      ...(["leftFoot", "rightFoot"] as const).map(
        (s) =>
          (new Vector3(...previous[s].position).distanceTo(
            new Vector3(...next[s].position),
          ) *
            1.875) /
          0.18,
      ),
      (new Vector3(...previous.pelvis.offset).distanceTo(
        new Vector3(...next.pelvis.offset),
      ) *
        1.875) /
        0.12,
      ...(["bend", "twist", "lean"] as const).map(
        (k) => (Math.abs(next.torso[k] - previous.torso[k]) * 1.875) / 0.5,
      ),
      (Math.abs(next.pelvis.yaw - previous.pelvis.yaw) * 1.875) / 0.5,
      ...(["left", "right"] as const).map(
        (s) =>
          (Math.abs(next.shoulders[s] - previous.shoulders[s]) * 1.875) / 0.5,
      ),
      ...(["left", "right"] as const).map(
        (s) => (Math.abs(next[s].roll - previous[s].roll) * 1.875) / 2,
      ),
      ...(["leftFoot", "rightFoot"] as const).flatMap((s) =>
        (["yaw", "pitch"] as const).map(
          (k) => (Math.abs(next[s][k] - previous[s][k]) * 1.875) / 0.5,
        ),
      ),
    );
    const segment = { from: previous, to: next, start: elapsed, duration };
    elapsed += duration;
    requestedTime = point.time;
    previous = next;
    return segment;
  });
}

export function createMotionController(): MotionController {
  let driver: RigDriver | undefined,
    current = restPose();
  let cancel: (() => void) | undefined;
  return {
    ready: () => !!driver,
    pose: () => structuredClone(current),
    attach(value) {
      cancel?.();
      driver?.dispose();
      driver = value;
      current = driver.apply(current).pose;
    },
    detach() {
      cancel?.();
      driver?.dispose();
      driver = undefined;
    },
    stop() {
      cancel?.();
    },
    reset() {
      if (!driver?.reset) throw new Error("The avatar is not ready to reset.");
      cancel?.();
      current = driver.reset();
      return structuredClone(current);
    },
    execute(motion, signal) {
      if (!driver)
        return Promise.reject(new Error("The avatar is still loading."));
      cancel?.();
      const segments = planMotion(current, motion);
      const duration = segments.at(-1)!.start + segments.at(-1)!.duration;
      if (duration > 40)
        return Promise.reject(
          new Error(
            "Motion is too long after speed limits; use fewer or closer targets.",
          ),
        );
      return new Promise<MotionResult>((resolve) => {
        const started = performance.now();
        let previousTime = 0;
        let firstFrameMs: number | null = null;
        let frames = 0,
          slowFrames = 0,
          maxFrameGapMs = 0;
        let totalApplyMs = 0,
          maxApplyMs = 0;
        const reasons = new Set<string>();
        if (duration > motion.waypoints.at(-1)!.time + 0.001)
          reasons.add("Requested timing extended by movement speed limits");
        let frame = 0,
          done = false,
          constrained = duration > motion.waypoints.at(-1)!.time + 0.001;
        const finish = (status: MotionResult["status"]) => {
          if (done) return;
          done = true;
          cancelAnimationFrame(frame);
          signal?.removeEventListener("abort", abort);
          cancel = undefined;
          if (status === "interrupted") driver?.halt?.();
          resolve({
            status,
            pose: structuredClone(current),
            constrained,
            duration: (performance.now() - started) / 1000,
            reasons: [...reasons],
            timing: {
              requestedSeconds: motion.waypoints.at(-1)!.time,
              plannedSeconds: duration,
              firstFrameMs,
              settlingSeconds: Math.max(
                0,
                (performance.now() - started) / 1000 - duration,
              ),
              frames,
              slowFrames,
              maxFrameGapMs,
              meanApplyMs: frames ? totalApplyMs / frames : 0,
              maxApplyMs,
            },
          });
        };
        const abort = () => finish("interrupted");
        cancel = abort;
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) return abort();
        const tick = () => {
          const time = (performance.now() - started) / 1000;
          firstFrameMs ??= time * 1000;
          const gapMs = (time - previousTime) * 1000;
          frames++;
          if (gapMs > 50) slowFrames++;
          maxFrameGapMs = Math.max(maxFrameGapMs, gapMs);
          const segment =
            segments.find((s) => time < s.start + s.duration) ??
            segments.at(-1)!;
          const t = Math.min(
            1,
            Math.max(0, (time - segment.start) / segment.duration),
          );
          const applyStart = performance.now();
          const applied = driver!.apply(
            interpolate(segment.from, segment.to, ease(t)),
            Math.min(0.033, Math.max(0.001, time - previousTime)),
          );
          const applyMs = performance.now() - applyStart;
          totalApplyMs += applyMs;
          maxApplyMs = Math.max(maxApplyMs, applyMs);
          previousTime = time;
          current = applied.pose;
          constrained ||= applied.constrained;
          applied.reasons?.forEach((reason) => reasons.add(reason));
          if (
            time >= duration &&
            (applied.settled !== false || time >= duration + 3)
          ) {
            if (applied.settled === false) {
              constrained = true;
              reasons.add("Movement stopped before the target settled");
              driver!.halt?.();
            }
            finish("completed");
          } else frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
    },
  };
}
