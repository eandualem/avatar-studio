import { z } from "zod";
import { pendingSchema, type Message } from "./conversation";

export enum VoicePhase {
  Idle = "idle",
  Connecting = "connecting",
  Active = "active",
  Cancelling = "cancelling",
  Closing = "closing",
}

export const voiceOfferSchema = z.object({
  call_id: z.string().uuid(),
  session_id: z.string(),
  transport: z.object({ type: z.literal("webrtc"), sdp: z.string().min(1) }),
});
export const fragmentSchema = z.object({
  role: z.enum(["user", "assistant"]),
  delta: z.string(),
  start_ms: z.number().nullable().optional(),
  end_ms: z.number().nullable().optional(),
});
export const delegationSchema = z.object({
  id: z.string(),
  status: z.string(),
  pending_tool_call: pendingSchema.nullish(),
});
export const voiceEventSchema = z.object({
  type: z.literal("voice"),
  call_id: z.string(),
  event: z.string(),
  data: z.record(z.unknown()),
});
export type VoiceFragment = z.infer<typeof fragmentSchema>;
export type VoiceEvent = z.infer<typeof voiceEventSchema>;
export type VoiceView = {
  callId: string;
  messages: Message[];
  micMuted: boolean;
  soundBlocked: boolean;
  speaking: boolean;
  work: string;
  elapsed: number;
  remoteClosed: boolean;
  finalized: boolean;
  warning: string;
  fatal: string;
};
export const initialVoiceView = (): VoiceView => ({
  callId: "",
  messages: [],
  micMuted: false,
  soundBlocked: false,
  speaking: false,
  work: "",
  elapsed: 0,
  remoteClosed: false,
  finalized: false,
  warning: "",
  fatal: "",
});
