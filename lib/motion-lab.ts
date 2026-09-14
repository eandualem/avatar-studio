import {
  motionSchema,
  type Motion,
  type Pose,
  type MotionController,
} from "@/types/avatar";
import type { Pending, ToolReceipt } from "@/types/conversation";
import { executeTool } from "./host-tools";
import { planMotion, restPose } from "./motion";

// Editable examples of the public tool contract, never agent-side gesture names.
export const motionExamples: { name: string; hint: string; motion: Motion }[] =
  [
    {
      name: "Head glance",
      hint: "A small isolated movement. Angles are radians; try yaw ±0.2 and 0.2 seconds per segment. Speed limits may extend execution.",
      motion: {
        waypoints: [
          { time: 0.2, head: { yaw: 0.2, nod: 0, tilt: 0 } },
          { time: 0.4, head: { yaw: 0, nod: 0, tilt: 0 } },
        ],
      },
    },
    {
      name: "Raise left hand",
      hint: "Robot left is viewer right. Requests a 0.6-second raise; current speed limits may extend it. Direction rotates the fingers, subject to wrist limits.",
      motion: {
        waypoints: [
          {
            time: 0.6,
            left: {
              position: [0.29, 0.83, 0.09],
              direction: [0, 1, 0],
              curls: [0, 0, 0, 0, 0],
              roll: 0,
            },
          },
        ],
      },
    },
    {
      name: "Small wave",
      hint: "Raise, then make small lateral movements. Times are cumulative. Each waypoint eases to a stop; extra waypoints can look hesitant.",
      motion: {
        waypoints: [
          {
            time: 0.6,
            left: {
              position: [0.29, 0.83, 0.09],
              direction: [0, 1, 0],
              curls: [0, 0, 0, 0, 0],
              roll: 0,
            },
          },
          { time: 2.2 / 3, left: { position: [0.32, 0.83, 0.09] } },
          { time: 2.6 / 3, left: { position: [0.27, 0.83, 0.09] } },
          { time: 1, left: { position: [0.3, 0.83, 0.09] } },
        ],
      },
    },
    {
      name: "Point with fingers",
      hint: "Curls: thumb, index, middle, ring, pinky. 0 opens and 1 closes. This changes fingers only, holding the current arm position.",
      motion: {
        waypoints: [
          { time: 1 / 3, left: { curls: [0.65, 0, 0.85, 0.85, 0.85] } },
        ],
      },
    },
    {
      name: "Shallow crouch",
      hint: "Keep feet planted. Pelvis offset is relative to standing: negative Y lowers, negative Z moves hips back. Try this from standing.",
      motion: {
        waypoints: [
          {
            time: 0.5,
            pelvis: { offset: [0, -0.07, -0.055], yaw: 0 },
            torso: { bend: 0.2, twist: 0, lean: 0 },
          },
        ],
      },
    },
    {
      name: "Kicking stance",
      hint: "Reset first. Shift onto the left foot, lift the right knee, then extend the leg forward with the left arm outstretched. Holds the stance. Static support and joint limits can shorten the kick; this is a pose, not a dynamic strike.",
      motion: {
        waypoints: [
          {
            time: 0.5,
            pelvis: { offset: [0.1, -0.02, -0.03], yaw: -0.35 },
            torso: { bend: -0.12, twist: 0.15, lean: 0 },
            left: { position: [0.42, 0.69, 0.07], direction: [1, 0, 0] },
            right: { position: [-0.23, 0.64, 0.16] },
          },
          {
            time: 1,
            rightFoot: {
              position: [-0.05, 0.26, 0.15],
              yaw: -0.3,
              pitch: -0.3,
            },
          },
          {
            time: 1.5,
            rightFoot: {
              position: [-0.28, 0.42, 0.28],
              yaw: -0.3,
              pitch: -0.4,
            },
          },
        ],
      },
    },
    {
      name: "Return to rest",
      hint: "Requests the standing rest pose through the same solver; it does not teleport or bypass constraints. From a blocked pose, adjust the path first.",
      motion: { waypoints: [{ time: 2 / 3, ...restPose() }] },
    },
  ];

export type LabReport = {
  call: Pending;
  before: Pose;
  receipt: ToolReceipt;
  elapsedMs: number;
};

export function resetLabPose(controller: MotionController): LabReport {
  const before = controller.pose();
  const started = performance.now();
  const call = {
    call_id: crypto.randomUUID(),
    tool_name: "reset_pose",
    arguments: {},
  };
  try {
    if (!controller.reset)
      throw new Error("The avatar does not support pose reset.");
    const pose = controller.reset();
    return {
      call,
      before,
      receipt: { result: { status: "reset", pose } },
      elapsedMs: performance.now() - started,
    };
  } catch (error) {
    return {
      call,
      before,
      receipt: {
        outcome: "failed",
        result: {
          error: error instanceof Error ? error.message : "Pose reset failed",
        },
      },
      elapsedMs: performance.now() - started,
    };
  }
}

export function previewMotion(source: string, pose: Pose) {
  try {
    const parsed = motionSchema.safeParse(JSON.parse(source));
    if (!parsed.success)
      return {
        error: parsed.error.issues
          .map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`)
          .join("\n"),
      };
    const segments = planMotion(pose, parsed.data);
    const planned = segments.at(-1)!.start + segments.at(-1)!.duration;
    if (planned > 40)
      return {
        error:
          "Motion exceeds 40 seconds after speed limits. Use fewer or closer targets.",
      };
    return {
      motion: parsed.data,
      segments,
      planned,
      requested: parsed.data.waypoints.at(-1)!.time,
    };
  } catch {
    return {
      error:
        "Enter valid JSON, with quoted property names and no trailing commas.",
    };
  }
}

export async function runLabTool(
  call: Pending,
  controller: MotionController,
  signal: AbortSignal,
): Promise<LabReport> {
  const before = controller.pose();
  const started = performance.now();
  const receipt = await executeTool(call, controller, signal);
  return { call, before, receipt, elapsedMs: performance.now() - started };
}
