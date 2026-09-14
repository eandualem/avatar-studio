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
    const requestedDuration = point.time - requestedTime;
    const floors: { channel: string; minimumSeconds: number }[] = [];
    const bound = (channel: string, change: number, rate: number) =>
      floors.push({
        channel,
        minimumSeconds: (Math.abs(change) * 1.875) / rate,
      });
    for (const side of ["left", "right"] as const) {
      bound(
        `${side} hand travel`,
        new Vector3(...previous[side].position).distanceTo(
          new Vector3(...next[side].position),
        ),
        0.45,
      );
      bound(
        `${side} hand direction`,
        new Vector3(...previous[side].direction).angleTo(
          new Vector3(...next[side].direction),
        ),
        3,
      );
      bound(
        `${side} fingers`,
        Math.max(
          ...next[side].curls.map((v, i) =>
            Math.abs(v - previous[side].curls[i]),
          ),
        ),
        2,
      );
      bound(`${side} palm roll`, next[side].roll - previous[side].roll, 2);
      bound(
        `${side} shoulder`,
        next.shoulders[side] - previous.shoulders[side],
        0.5,
      );
    }
    for (const key of ["yaw", "nod", "tilt"] as const)
      bound(`head ${key}`, next.head[key] - previous.head[key], 0.8);
    for (const side of ["leftFoot", "rightFoot"] as const) {
      bound(
        `${side} travel`,
        new Vector3(...previous[side].position).distanceTo(
          new Vector3(...next[side].position),
        ),
        0.18,
      );
      for (const key of ["yaw", "pitch"] as const)
        bound(`${side} ${key}`, next[side][key] - previous[side][key], 0.5);
    }
    bound(
      "pelvis travel",
      new Vector3(...previous.pelvis.offset).distanceTo(
        new Vector3(...next.pelvis.offset),
      ),
      0.12,
    );
    bound("pelvis yaw", next.pelvis.yaw - previous.pelvis.yaw, 0.5);
    for (const key of ["bend", "twist", "lean"] as const)
      bound(`torso ${key}`, next.torso[key] - previous.torso[key], 0.5);
    const duration = Math.max(
      requestedDuration,
      ...floors.map((f) => f.minimumSeconds),
    );
    const limits = floors
      .filter((f) => f.minimumSeconds > requestedDuration + 0.001)
      .sort((a, b) => b.minimumSeconds - a.minimumSeconds);
    const segment = {
      from: previous,
      to: next,
      start: elapsed,
      duration,
      requestedDuration,
      limits,
    };
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
    capture: () => driver?.capture?.(),
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
              segments: segments.map((segment) => ({
                requestedSeconds: segment.requestedDuration,
                plannedSeconds: segment.duration,
                limits: segment.limits,
              })),
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
