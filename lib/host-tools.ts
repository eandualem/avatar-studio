import { motionSchema, type MotionController } from "@/types/avatar";
import type { Pending, ToolReceipt } from "@/types/conversation";
import { restPose } from "./motion";

const vector = {
  type: "array",
  items: { type: "number" },
  minItems: 3,
  maxItems: 3,
};
const hand = {
  type: "object",
  additionalProperties: false,
  properties: {
    position: {
      ...vector,
      description:
        "Wrist [x,y,z], units=avatar height. X positive robot left; Y up; Z forward. |x|<=0.65, y=0.15..1.15, z=-0.1..0.65.",
    },
    direction: {
      ...vector,
      description:
        "Nonzero direction wrist to fingers. Limited to 35 degrees from forearm.",
    },
    curls: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: { type: "number", minimum: 0, maximum: 1 },
      description: "Thumb,index,middle,ring,pinky; 0=open, 1=closed.",
    },
  },
};
export const actions = [
  {
    name: "move_avatar",
    description:
      "Compose a new continuous motion from timed hand, finger and head goals. No animation presets. Omitted channels hold their previous value. Times increase, seconds from now. Motions may slow or clamp to reachable targets. Returns actual final pose when finished.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["waypoints"],
      properties: {
        waypoints: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["time"],
            properties: {
              time: { type: "number", minimum: 0.2, maximum: 20 },
              left: hand,
              right: hand,
              head: {
                type: "object",
                additionalProperties: false,
                required: ["yaw", "nod"],
                properties: {
                  yaw: { type: "number", minimum: -0.55, maximum: 0.55 },
                  nod: { type: "number", minimum: -0.25, maximum: 0.25 },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    name: "get_pose",
    description:
      "Read actual current hand targets, finger curls and head angles.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
export function hostContext(controller: MotionController) {
  return {
    version: 1,
    host: { name: "avatar-studio", kind: "browser", version: "0.1.0" },
    view: {
      name: "conversation",
      description: "A written conversation beside Charlie, a live robot.",
      data: {
        coordinates:
          "X robot left (viewer right), Y up, Z forward toward viewer. Ground y=0. Height=1. Radians for head.",
        current_pose: controller.pose(),
        rest_pose: restPose(),
        landmarks: {
          left_shoulder: [0.107, 0.737, -0.0045],
          right_shoulder: [-0.107, 0.737, -0.0045],
          comfortable_left_raised_hand: [0.29, 0.83, 0.07],
          comfortable_right_raised_hand: [-0.29, 0.83, 0.07],
        },
        limits:
          "Hands, fingers, head only. No walking, balance, lip sync, collision avoidance or independent palm roll. Avoid torso crossings. Targets are reachable-clamped; hands have a 35-degree swing limit.",
      },
      state: { avatar_ready: controller.ready() },
    },
    actions: controller.ready() ? actions : [],
    captured_at: new Date().toISOString(),
  };
}
export async function executeTool(
  pending: Pending,
  controller: MotionController,
  signal: AbortSignal,
): Promise<ToolReceipt> {
  try {
    const args: unknown =
      typeof pending.arguments === "string"
        ? JSON.parse(pending.arguments)
        : pending.arguments;
    if (pending.tool_name === "get_pose")
      return { result: { pose: controller.pose() } };
    if (pending.tool_name !== "move_avatar")
      throw new Error("Unsupported avatar tool: " + pending.tool_name);
    const motion = motionSchema.parse(args);
    return { result: await controller.execute(motion, signal) };
  } catch (error) {
    return {
      outcome: "failed",
      result: {
        error: error instanceof Error ? error.message : "Movement failed",
      },
    };
  }
}
