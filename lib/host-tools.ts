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
    roll: {
      type: "number",
      minimum: -0.6,
      maximum: 0.6,
      description:
        "Palm roll relative to the forearm, radians. Use modest values.",
    },
  },
};
const foot = {
  type: "object",
  additionalProperties: false,
  properties: {
    position: {
      ...vector,
      description:
        "Ankle target [x,y,z]. Default feet at [±0.1043,0.0871,-0.0035]. |x|<=0.4, y=0.07..0.6, z=-0.3..0.4. Keep one foot planted; shift pelvis over it before lifting the other.",
    },
    yaw: { type: "number", minimum: -0.45, maximum: 0.45 },
    pitch: { type: "number", minimum: -0.4, maximum: 0.4 },
  },
};
export const actions = [
  {
    name: "move_avatar",
    description:
      "Compose continuous whole-body motion: hands/fingers, feet/legs, pelvis, torso, shoulders, head. No animation presets. Omitted channels hold their previous value. Times increase in seconds from now. Joint limits, collisions, floor and planted-foot support constrain motion. Returns actual pose and reasons; adapt if a target was blocked.",
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
              leftFoot: foot,
              rightFoot: foot,
              pelvis: {
                type: "object",
                additionalProperties: false,
                required: ["offset", "yaw"],
                properties: {
                  offset: {
                    ...vector,
                    description:
                      "Offset from standing hips, NOT absolute position. |x|<=0.14, y=-0.18..0.04, |z|<=0.14. Negative y lowers body; negative z moves hips backward. Shift x toward planted foot before a leg lift.",
                  },
                  yaw: { type: "number", minimum: -0.5, maximum: 0.5 },
                },
              },
              torso: {
                type: "object",
                additionalProperties: false,
                required: ["bend", "twist", "lean"],
                properties: {
                  bend: {
                    type: "number",
                    minimum: -0.25,
                    maximum: 0.5,
                    description: "Positive bends forward.",
                  },
                  twist: { type: "number", minimum: -0.5, maximum: 0.5 },
                  lean: { type: "number", minimum: -0.25, maximum: 0.25 },
                },
              },
              shoulders: {
                type: "object",
                additionalProperties: false,
                required: ["left", "right"],
                properties: {
                  left: { type: "number", minimum: -0.1, maximum: 0.25 },
                  right: { type: "number", minimum: -0.1, maximum: 0.25 },
                },
              },
              head: {
                type: "object",
                additionalProperties: false,
                required: ["yaw", "nod"],
                properties: {
                  yaw: { type: "number", minimum: -0.55, maximum: 0.55 },
                  nod: { type: "number", minimum: -0.25, maximum: 0.25 },
                  tilt: { type: "number", minimum: -0.25, maximum: 0.25 },
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
      "Read the actual current whole-body pose, including feet, pelvis, torso, hands and head.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
export function hostContext(controller: MotionController) {
  return {
    version: 1,
    host: { name: "avatar-studio", kind: "browser", version: "0.2.0" },
    view: {
      name: "conversation",
      description: "A written conversation beside Charlie, a live robot.",
      data: {
        coordinates:
          "X robot left (viewer right), Y up, Z forward toward viewer. Ground y=0. Height=1. Radians for angles. Pelvis offset is relative to standing, all hand/foot targets are absolute.",
        current_pose: controller.pose(),
        rest_pose: restPose(),
        landmarks: {
          standing_left_shoulder: [0.107, 0.737, -0.0045],
          standing_right_shoulder: [-0.107, 0.737, -0.0045],
          comfortable_left_raised_hand: [0.29, 0.83, 0.07],
          comfortable_right_raised_hand: [-0.29, 0.83, 0.07],
        },
        limits:
          "Constrained arms and legs, palm roll/fingers, pelvis, torso, shoulders and head are supported. Knees/elbows hinge one way. Joint rates and wrist swing are limited. Simplified body collision, sole-floor and static support checks reject unsafe poses. No dynamic walking, jumping, physical balance or lip sync. Foot targets may need pelvis movement to be reachable.",
        motion_guidance:
          "For a shallow crouch keep feet fixed, lower pelvis.offset.y about -0.07, move pelvis.offset.z about -0.055, bend torso about 0.2. For a foot lift, first shift pelvis.offset.x about ±0.09 toward the foot staying planted, then raise the opposite ankle slowly. These are examples for composing targets, not gesture presets. Inspect results and use modest reaches.",
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
