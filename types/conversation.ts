import { z } from "zod";
export const pendingSchema = z.object({
  tool_name: z.string(),
  call_id: z.string(),
  arguments: z.union([z.record(z.unknown()), z.string()]).nullable(),
});
export const responseSchema = z.object({
  content: z.string().nullish(),
  session_id: z.string().optional(),
  message_id: z.string().optional(),
  pending_tool_call: pendingSchema.nullish(),
  error: z.string().nullish(),
});
export type Pending = z.infer<typeof pendingSchema>;
export type Reply = z.infer<typeof responseSchema>;
export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  source: z.enum(["voice", "backend"]).optional(),
});
export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(messageSchema).max(400),
  mode: z.enum(["text", "voice"]).optional(),
  voiceCalls: z.array(z.string()).max(100).optional(),
});
export const historySchema = z.array(conversationSchema).max(50);
export type Message = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ToolReceipt = { result: unknown; outcome?: "failed" };
