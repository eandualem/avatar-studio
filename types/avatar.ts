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
  })
  .strict();
export const waypointSchema = z
  .object({
    time: z.number().min(0.2).max(20),
    left: handSchema.optional(),
    right: handSchema.optional(),
    head: z
      .object({
        yaw: z.number().min(-0.55).max(0.55),
        nod: z.number().min(-0.25).max(0.25),
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
export type HandPose = { position: Vec3; direction: Vec3; curls: Curls };
export type Pose = {
  left: HandPose;
  right: HandPose;
  head: { yaw: number; nod: number };
};
export type MotionResult = {
  status: "completed" | "interrupted";
  pose: Pose;
  constrained: boolean;
  duration: number;
};
export type RigDriver = {
  apply: (pose: Pose) => { pose: Pose; constrained: boolean };
  dispose: () => void;
};
export interface MotionController {
  attach(driver: RigDriver): void;
  detach(): void;
  ready(): boolean;
  pose(): Pose;
  stop(): void;
  execute(motion: Motion, signal?: AbortSignal): Promise<MotionResult>;
}
