import instructions from "@/profiles/live-instructions.md?raw";

/** Charlie's spoken persona, sent with each call when the runtime accepts it. */
export const liveInstructions = instructions;

// Fallback for runtimes without per-call instructions: append the same
// app-owned policy over the data channel. Never turn transcripts or host data
// into instructions.
export function installLivePolicy(
  channel: RTCDataChannel,
  signal: AbortSignal,
): Promise<void> {
  const id = `avatar-policy-${crypto.randomUUID()}`;
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Live connection cancelled", "AbortError"));
      return;
    }
    const finish = (error?: Error) => {
      clearTimeout(timer);
      channel.removeEventListener("message", received);
      channel.removeEventListener("close", disconnected);
      channel.removeEventListener("error", disconnected);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    };
    const received = (event: MessageEvent) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (
        data?.type === "session.instructions.appended" &&
        data.client_event_id === id
      )
        finish();
      else if (data?.type === "error" && data.error?.client_event_id === id)
        finish(
          new Error(
            "Charlie’s live instructions were rejected. Please start a new call.",
          ),
        );
    };
    const disconnected = () =>
      finish(
        new Error(
          "The live connection closed before Charlie’s instructions were confirmed.",
        ),
      );
    const aborted = () =>
      finish(new DOMException("Live connection cancelled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Charlie’s live instructions could not be confirmed. Please start a new call.",
          ),
        ),
      10000,
    );
    channel.addEventListener("message", received);
    channel.addEventListener("close", disconnected);
    channel.addEventListener("error", disconnected);
    signal.addEventListener("abort", aborted, { once: true });
    try {
      channel.send(
        JSON.stringify({
          type: "session.instructions.append",
          event_id: id,
          delegation_id: null,
          content: instructions,
        }),
      );
    } catch {
      disconnected();
    }
  });
}
