import {
  responseSchema,
  type Conversation,
  type Pending,
  type ToolReceipt,
} from "@/types/conversation";
import type { MotionController } from "@/types/avatar";
import { hostContext } from "./host-tools";

export async function sendTurn(
  conversation: Conversation,
  controller: MotionController,
  signal: AbortSignal,
  continuation?: { pending: Pending; receipt: ToolReceipt },
) {
  const response = await fetch(
    conversation.mode === "voice"
      ? "/api/runtime/voice-chat"
      : "/api/runtime/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        id: crypto.randomUUID(),
        session_id: conversation.id,
        content: continuation ? "" : conversation.messages.at(-1)!.content,
        host_context: hostContext(
          controller,
          conversation.mode === "voice" ? conversation.messages : undefined,
        ),
        ...(continuation
          ? {
              tool_call_id: continuation.pending.call_id,
              tool_result: continuation.receipt.result,
              tool_outcome: continuation.receipt.outcome,
            }
          : {}),
      }),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.error === "string"
          ? body.error
          : "";
    if (/credit balance|insufficient_quota/i.test(detail))
      throw new Error(
        "The assistant account has no API credit. Add credit or configure another provider in assistant-runtime, then try again.",
      );
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "The assistant could not respond. Please try again.",
    );
  }
  const result = responseSchema.parse(body);
  if (result.error) throw new Error(result.error);
  return result;
}
export async function cancelTurn(id: string, mode?: Conversation["mode"]) {
  const response = await fetch(
    mode === "voice" ? "/api/runtime/voice-cancel" : "/api/runtime/cancel",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: id }),
    },
  );
  if (!response.ok)
    throw new Error("Could not confirm cancellation with the assistant.");
}
