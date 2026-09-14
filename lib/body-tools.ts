import { z } from "zod";
import { motionSchema, type MotionController } from "@/types/avatar";
import type { Message, Pending } from "@/types/conversation";
import { actions, hostContext } from "./host-tools";
import { conversationWindow } from "./conversation-window";

const metadata = {
  intent: { type: "string", enum: ["explicit", "incidental"] },
  label: {
    type: "string",
    minLength: 1,
    maxLength: 80,
    description: "Short physical action description, without narration.",
  },
};
export const bodyTools = [
  {
    ...actions[0],
    parameters: {
      ...actions[0].parameters,
      required: ["waypoints", "intent", "label"],
      properties: { ...actions[0].parameters.properties, ...metadata },
    },
  },
  {
    name: "hold_avatar",
    description:
      "Make no movement change. still=true requests a held pose and cancels current motion; false preserves current activity.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["still"],
      properties: { still: { type: "boolean" } },
    },
  },
  {
    name: "stop_avatar",
    description:
      "Stop current physical movement and remain still, only when the user requests it.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
  },
];
const move = motionSchema.extend({
  intent: z.enum(["explicit", "incidental"]),
  label: z.string().trim().min(1).max(80),
});
export function bodyDecision(pending: Pending) {
  const args: unknown =
    typeof pending.arguments === "string"
      ? JSON.parse(pending.arguments)
      : pending.arguments;
  if (pending.tool_name === "move_avatar") {
    const { intent, label, ...motion } = move.parse(args);
    return { kind: "move" as const, intent, label, motion };
  }
  if (pending.tool_name === "hold_avatar")
    return {
      kind: "hold" as const,
      ...z.object({ still: z.boolean() }).strict().parse(args),
    };
  if (pending.tool_name === "stop_avatar") {
    z.object({}).strict().parse(args);
    return { kind: "stop" as const };
  }
  throw new Error("The body controller returned an unsupported tool.");
}
export function bodyContext(
  controller: MotionController,
  messages: Message[],
  state: unknown,
) {
  const context = hostContext(controller, undefined, { capture: false });
  return {
    ...context,
    view: {
      ...context.view,
      name: "body-controller",
      data: {
        ...context.view.data,
        conversation: conversationWindow(messages, 10000),
        body_state: state,
      },
    },
    actions: controller.ready() ? bodyTools : bodyTools.slice(1),
  };
}
