import { setup, type ActorRefFrom } from "xstate";
import { createMotionController } from "@/lib/motion";
import { avatarMachine } from "./avatarMachine";
import { conversationMachine } from "./conversationMachine";
import { speechMachine } from "./speechMachine";

export const appMachine = setup({
  types: {
    context: {} as {
      avatar: ActorRefFrom<typeof avatarMachine>;
      conversation: ActorRefFrom<typeof conversationMachine>;
      speech: ActorRefFrom<typeof speechMachine>;
    },
  },
  actors: {
    avatar: avatarMachine,
    conversation: conversationMachine,
    speech: speechMachine,
  },
}).createMachine({
  id: "app",
  description:
    "Owns application domain actors.\n- avatar: rig lifecycle\n- conversation: assistant and motion requests\n- speech: microphone dictation",
  context: ({ spawn }) => {
    const controller = createMotionController();
    return {
      avatar: spawn("avatar", { input: { controller } }),
      conversation: spawn("conversation", { input: { controller } }),
      speech: spawn("speech"),
    };
  },
});
