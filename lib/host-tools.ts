import {
  motionSchema,
  type MotionController,
  type AvatarSnapshot,
} from "@/types/avatar";
import type { Pending, ToolReceipt, Message } from "@/types/conversation";
import { restPose } from "./motion";
import movementSkill from "@/profiles/skills/charlie-motion/SKILL.md?raw";

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
        "Ankle target [x,y,z]. Default feet at [±0.1043,0.0871,-0.0035]. |x|<=0.4, y=0.07..0.6, z=-0.3..0.4. In grounded mode, keep one foot planted and shift pelvis over it before lifting the other.",
    },
    yaw: { type: "number", minimum: -0.45, maximum: 0.45 },
    pitch: { type: "number", minimum: -0.4, maximum: 0.4 },
  },
};
const sequence = {
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
};
export const actions = [
  {
    name: "move_avatar",
    description:
      "Compose continuous whole-body motion: hands/fingers, feet/legs, pelvis, torso, shoulders, head. No animation presets. Omitted channels hold their previous value. Times increase separately within prepare, waypoints and finish. repeat counts the cycle executions. Joint limits, collisions and floor constrain all motion; grounded mode also requires planted-foot support. Returns actual pose and reasons; adapt if a target was blocked.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["waypoints"],
      properties: {
        prepare: {
          ...sequence,
          description: "One-time preparation; its times start at zero.",
        },
        waypoints: {
          ...sequence,
          description:
            "One cycle, times start at zero. Omitted channels resolve once from preparation and hold across repeats.",
        },
        repeat: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description:
            "Total cycle count, including the first (default 1). Preparation and finish happen once. Maximum whole plan 40 seconds.",
        },
        finish: {
          ...sequence,
          description:
            "One-time ending after all cycles; times start at zero. Use to return to standing.",
        },
        mode: {
          type: "string",
          enum: ["grounded", "animated"],
          description:
            "Default grounded enforces static balance. Animated allows unsupported/flight poses for running in place, with faster bounded limb rates; floor, collision and joint limits remain. No physics or scene travel.",
        },
        interpolation: {
          type: "string",
          enum: ["ease", "swing"],
          description:
            "Default ease settles at waypoints. Swing uses sinusoidal reversals for rhythmic back-and-forth cycles; use two opposing extremes and return to the prepared pose.",
        },
      },
    },
  },
  {
    name: "capture_avatar",
    description:
      "Capture a fresh image of Charlie's current rendered pose, without the chat or desktop. Then use look_at_screen to inspect it before judging or improving a pose. This captures only; it never moves the body.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_pose",
    description:
      "Read the actual current whole-body pose, including feet, pelvis, torso, hands and head.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
export function captureAvatar(controller: MotionController): {
  snapshot?: AvatarSnapshot;
  error?: string;
} {
  try {
    const snapshot = controller.capture?.();
    if (!snapshot)
      return {
        error:
          "Avatar capture unavailable; use capture_avatar once the renderer is ready.",
      };
    return { snapshot };
  } catch {
    return {
      error:
        "Avatar capture failed. No fresh image is available; do not infer appearance from numeric pose alone.",
    };
  }
}
export function hostContext(
  controller: MotionController,
  visibleHistory?: Message[],
) {
  const capture = captureAvatar(controller);
  return {
    version: 1,
    host: { name: "avatar-studio", kind: "browser", version: "0.2.0" },
    view: {
      name: "conversation",
      description: "A written conversation beside Charlie, a live robot.",
      data: {
        ...(visibleHistory?.length
          ? {
              recent_visible_messages: visibleHistory
                .slice(-12)
                .map(({ role, content }) => ({
                  role,
                  content: content.slice(-400),
                })),
            }
          : {}),
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
          "Constrained arms and legs, palm roll/fingers, pelvis, torso, shoulders and head are supported. Knees/elbows hinge one way. Joint rates and wrist swing are limited. Simplified body collision, sole-floor and static support checks reject unsafe poses. Animated mode supports procedural running in place and flight poses with faster bounded rates, without static balance. No scene travel or physics. Live speech drives a simple mouth opening, not phoneme lip sync. Foot targets may need pelvis movement to be reachable.",
        motion_guidance:
          "For a shallow crouch keep feet fixed, lower pelvis.offset.y about -0.07, move pelvis.offset.z about -0.055, bend torso about 0.2. For a foot lift, first shift pelvis.offset.x about ±0.09 toward the foot staying planted, then raise the opposite ankle slowly. These are examples for composing targets, not gesture presets. Inspect results and use modest reaches.",
        movement_skill: movementSkill,
        visual_feedback: capture.snapshot
          ? {
              available: true,
              captured_at: capture.snapshot.capturedAt,
              scope:
                "Avatar canvas only, from the current camera. Use look_at_screen to inspect; use capture_avatar for a fresh frame.",
            }
          : { available: false, error: capture.error },
      },
      state: { avatar_ready: controller.ready() },
    },
    actions: controller.ready() ? actions : [],
    attachments: capture.snapshot
      ? [
          {
            kind: "image",
            purpose: "screenshot",
            name: "Charlie current pose",
            description:
              "Only the rendered avatar, from the user's current camera. Captured " +
              capture.snapshot.capturedAt,
            data_uri: capture.snapshot.dataUri,
          },
        ]
      : [],
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
    if (pending.tool_name === "capture_avatar") {
      if (signal.aborted) throw new Error("Avatar capture cancelled.");
      const { snapshot, error } = captureAvatar(controller);
      if (!snapshot) throw new Error(error);
      return {
        result: {
          screenshot: snapshot.dataUri,
          captured_at: snapshot.capturedAt,
          width: snapshot.width,
          height: snapshot.height,
          pose: controller.pose(),
          message:
            "Fresh avatar-only image captured. Use look_at_screen to inspect it.",
        },
      };
    }
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
