import { z } from "zod";

export const vectorSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const curlsSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);
export const handSchema = z
  .object({
    position: vectorSchema
      .refine(
        ([x, y, z]) =>
          Math.abs(x) <= 0.65 &&
          y >= 0.15 &&
          y <= 1.15 &&
          z >= -0.1 &&
          z <= 0.65,
        "Hand target is outside the supported workspace",
      )
      .optional(),
    direction: vectorSchema
      .refine((v) => Math.hypot(...v) > 0.001, "Direction must be nonzero")
      .optional(),
    curls: curlsSchema.optional(),
    roll: z.number().min(-0.6).max(0.6).optional(),
  })
  .strict();
export const footSchema = z
  .object({
    position: vectorSchema
      .refine(
        ([x, y, z]) =>
          Math.abs(x) <= 0.4 && y >= 0.07 && y <= 0.6 && z >= -0.3 && z <= 0.4,
        "Foot target is outside the supported workspace",
      )
      .optional(),
    yaw: z.number().min(-0.45).max(0.45).optional(),
    pitch: z.number().min(-0.4).max(0.4).optional(),
  })
  .strict();
export const pelvisSchema = z
  .object({
    offset: vectorSchema.refine(
      ([x, y, z]) =>
        Math.abs(x) <= 0.14 && y >= -0.18 && y <= 0.04 && Math.abs(z) <= 0.14,
      "Pelvis offset is outside the supported workspace",
    ),
    yaw: z.number().min(-0.5).max(0.5),
  })
  .strict();
export const torsoSchema = z
  .object({
    bend: z.number().min(-0.25).max(0.5),
    twist: z.number().min(-0.5).max(0.5),
    lean: z.number().min(-0.25).max(0.25),
  })
  .strict();
export const waypointSchema = z
  .object({
    time: z.number().min(0.2).max(20),
    left: handSchema.optional(),
    right: handSchema.optional(),
    leftFoot: footSchema.optional(),
    rightFoot: footSchema.optional(),
    pelvis: pelvisSchema.optional(),
    torso: torsoSchema.optional(),
    shoulders: z
      .object({
        left: z.number().min(-0.1).max(0.25),
        right: z.number().min(-0.1).max(0.25),
      })
      .strict()
      .optional(),
    head: z
      .object({
        yaw: z.number().min(-0.55).max(0.55),
        nod: z.number().min(-0.25).max(0.25),
        tilt: z.number().min(-0.25).max(0.25).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const motionSchema = z
  .object({ waypoints: z.array(waypointSchema).min(1).max(16) })
  .strict()
  .refine(
    (v) =>
      v.waypoints.every((p, i) => i === 0 || p.time > v.waypoints[i - 1].time),
    "Waypoint times must increase",
  );
export type Vec3 = z.infer<typeof vectorSchema>;
export type Curls = z.infer<typeof curlsSchema>;
export type Motion = z.infer<typeof motionSchema>;
export type HandPose = {
  position: Vec3;
  direction: Vec3;
  curls: Curls;
  roll: number;
};
export type FootPose = { position: Vec3; yaw: number; pitch: number };
export type Pose = {
  left: HandPose;
  right: HandPose;
  leftFoot: FootPose;
  rightFoot: FootPose;
  pelvis: z.infer<typeof pelvisSchema>;
  torso: z.infer<typeof torsoSchema>;
  shoulders: { left: number; right: number };
  head: { yaw: number; nod: number; tilt: number };
};
export type MotionResult = {
  status: "completed" | "interrupted";
  pose: Pose;
  constrained: boolean;
  duration: number;
  reasons?: string[];
};
export type RigDriver = {
  apply: (
    pose: Pose,
    dt?: number,
  ) => {
    pose: Pose;
    constrained: boolean;
    settled?: boolean;
    reasons?: string[];
  };
  dispose: () => void;
  halt?: () => void;
};
export interface MotionController {
  attach(driver: RigDriver): void;
  detach(): void;
  ready(): boolean;
  pose(): Pose;
  stop(): void;
  execute(motion: Motion, signal?: AbortSignal): Promise<MotionResult>;
}
