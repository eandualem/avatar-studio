import { z } from "zod";
import { pendingSchema } from "@/types/conversation";
import instructions from "@/profiles/body-instructions.md?raw";
import { bodyModelConfig } from "./body-model";
import type { BodyTransport } from "./body-controller";

async function request(operation: string, body: unknown, timeout = 15000) {
  const response = await fetch(`/api/runtime/body-${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.detail === "string"
        ? result.detail
        : typeof result.error === "string"
          ? result.error
          : "The body runtime is unavailable.",
    );
  return result;
}
const responseSchema = z.object({
  content: z.string().nullish(),
  pending_tool_call: pendingSchema.nullish(),
  decision: z.enum(["hold", "pending", "completed"]).nullish(),
  error: z.string().nullish(),
});
export const bodyTransport: BodyTransport = {
  async decide(input, signal) {
    signal.throwIfAborted();
    // The runtime renders host_context into its system prompt and sends these
    // instructions as the user turn. Smaller models then take the instructions
    // themselves for the latest utterance and hold, so the utterance is also
    // quoted here, where the model looks for it.
    const utterance = input.host_context.view.data.conversation.findLast(
      (message) => message.role === "user",
    )?.content;
    // Cancellation invalidates app admission and uses the runtime cancel API.
    // Keep reading the bounded response so a late pending tool can receive a
    // failed receipt instead of leaving its decision session awaiting a result.
    const result = responseSchema.parse(
      await request(
        "chat",
        {
          ...input,
          ...bodyModelConfig(),
          output_mode: "host_tools",
          content:
            instructions +
            "\n\nDecide once for the latest user utterance in host_context.view.data.conversation. The accompanying body_state and current_pose are authoritative." +
            (utterance ? `\n\nLatest user utterance: ${JSON.stringify(utterance)}` : ""),
        },
        120000,
      ),
    );
    if (result.error) throw new Error(result.error);
    if (result.content?.trim())
      throw new Error(
        "Body runtime returned prose instead of a tool-only decision.",
      );
    if (result.decision === "pending" && result.pending_tool_call)
      return result.pending_tool_call;
    if (result.decision === "hold") return null;
    throw new Error("The runtime did not return a body decision.");
  },
  async receipt(input, pending, receipt) {
    const result = responseSchema.parse(
      await request("chat", {
        id: crypto.randomUUID(),
        session_id: input.session_id,
        content: "",
        output_mode: "host_tools",
        tool_call_id: pending.call_id,
        tool_result: receipt.result,
        tool_outcome: receipt.outcome ?? "success",
      }),
    );
    if (
      result.error ||
      result.content?.trim() ||
      result.pending_tool_call ||
      result.decision !== "completed"
    )
      throw new Error("The body receipt did not terminate silently.");
  },
  async cancel(sessionId, requestId) {
    await request("cancel", { session_id: sessionId, request_id: requestId });
  },
};
