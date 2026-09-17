import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { bodyTransport } from "@/lib/body-runtime";
import { bodyContext } from "@/lib/body-tools";
import { restPose } from "@/lib/motion";
import { bodyMessages } from "@/lib/body-transcript";
import { LiveBodyFacts } from "@/lib/live-body-facts";
import type { MotionController } from "@/types/avatar";
import { POST } from "@/app/api/runtime/[operation]/route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const pending = {
  tool_name: "hold_avatar",
  call_id: "hold-1",
  arguments: { still: false },
};
const input = {
  id: crypto.randomUUID(),
  session_id: crypto.randomUUID(),
  revision: 1,
  host_context: bodyContext(
    { ready: () => true, pose: restPose } as MotionController,
    [{ id: "u", role: "user", content: "Hello" }],
    { still: false },
  ),
};
it("requires terminal tool-only decisions and records receipts with no narration turn", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      content: null,
      decision: "pending",
      pending_tool_call: pending,
    }),
  );
  vi.stubGlobal("fetch", fetch);
  expect(
    await bodyTransport.decide(input, new AbortController().signal),
  ).toEqual(pending);
  expect(fetch.mock.calls[0]).toMatchObject([
    "/api/runtime/body-chat",
    { method: "POST" },
  ]);
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  const request = JSON.parse(calls[0][1].body as string);
  expect(request.output_mode).toBe("host_tools");
  expect(request.content).toContain('Latest user utterance: "Hello"');
  expect(request.config).toBeUndefined();
  expect(
    request.host_context.actions.map((a: { name: string }) => a.name),
  ).toEqual(["move_avatar", "hold_avatar", "stop_avatar"]);
  expect(request.host_context.attachments).toEqual([]);
  fetch.mockResolvedValueOnce(
    Response.json({ content: null, decision: "completed" }),
  );
  await bodyTransport.receipt(input, pending, { result: { status: "held" } });
  expect(JSON.parse(calls[1][1].body as string)).toMatchObject({
    session_id: input.session_id,
    tool_call_id: pending.call_id,
    content: "",
    output_mode: "host_tools",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([
  { content: "I am waving", decision: "pending", pending_tool_call: pending },
  { content: null, pending_tool_call: pending },
  { content: null, decision: "completed" },
  { content: null },
])("rejects nonterminal, empty and prose body outputs", async (body) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body)),
  );
  await expect(
    bodyTransport.decide(input, new AbortController().signal),
  ).rejects.toThrow();
});
it("supports native hold without a fabricated tool receipt", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ content: null, decision: "hold" })),
  );
  expect(
    await bodyTransport.decide(input, new AbortController().signal),
  ).toBeNull();
});
it("routes body requests to the isolated runtime and validates origin before proxying", async () => {
  vi.stubEnv("BODY_RUNTIME_URL", "http://body.local");
  vi.stubEnv("VOICE_RUNTIME_URL", "http://voice.local");
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ decision: "hold" }),
  );
  vi.stubGlobal("fetch", fetch);
  const params = { params: Promise.resolve({ operation: "body-chat" }) };
  expect(
    (
      await POST(
        new NextRequest("http://app.local/api/runtime/body-chat", {
          method: "POST",
          body: JSON.stringify(input),
        }),
        params,
      )
    ).status,
  ).toBe(200);
  expect(fetch.mock.calls[0][0]).toBe("http://body.local/api/chat");
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({
    profile: "avatar_studio",
    config: {
      default_model: "openai:gpt-6-astra",
      enable_working_memory: false,
    },
  });
  // Text conversations carry the same profile with their own model defaults.
  expect(
    (
      await POST(
        new NextRequest("http://app.local/api/runtime/chat", {
          method: "POST",
          body: JSON.stringify({ ...input, session_id: crypto.randomUUID() }),
        }),
        { params: Promise.resolve({ operation: "chat" }) },
      )
    ).status,
  ).toBe(200);
  expect(fetch.mock.calls[1][0]).toBe("http://127.0.0.1:7100/api/chat");
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toMatchObject({
    profile: "avatar_studio",
    config: { default_model: "openai:gpt-5.6-sol", thinking_budget: 4000 },
  });
  expect(
    (
      await POST(
        new NextRequest("http://app.local/api/runtime/body-chat", {
          method: "POST",
          headers: { origin: "http://other.local" },
          body: "{}",
        }),
        params,
      )
    ).status,
  ).toBe(403);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("keeps a user utterance together across interleaved assistant fragments", () => {
  const history = [
    { id: "old", role: "assistant" as const, content: "How can I help?" },
  ];
  const fragments = [
    { role: "user" as const, delta: "Can you", start_ms: 0, end_ms: 300 },
    { role: "assistant" as const, delta: "Yes?", start_ms: 350, end_ms: 400 },
    { role: "user" as const, delta: " wave?", start_ms: 450, end_ms: 700 },
  ];
  const first = bodyMessages("call", fragments.slice(0, 1), history);
  const final = bodyMessages("call", fragments, history);
  expect(final.at(-1)).toEqual({
    id: first.at(-1)!.id,
    role: "user",
    content: "Can you wave?",
  });
  expect(final[0]).toEqual(history[0]);
  const next = bodyMessages(
    "call",
    [
      ...fragments,
      { role: "user", delta: "Run now", start_ms: 2400, end_ms: 2700 },
    ],
    history,
  );
  expect(next.at(-1)?.id).not.toBe(first.at(-1)?.id);
  expect(next.at(-1)?.content).toBe("Run now");
});
it("correlates quiet engine facts, ignores unrelated acknowledgments and reports timeout without retry", async () => {
  vi.useFakeTimers();
  const channel = Object.assign(new EventTarget(), {
    readyState: "open",
    send: vi.fn(),
  });
  const changed = vi.fn();
  const facts = new LiveBodyFacts(
    channel as unknown as RTCDataChannel,
    changed,
  );
  const action = {
    id: "action",
    revision: 3,
    utteranceId: "u",
    intent: "explicit" as const,
    label: "wave",
    status: "started" as const,
    utteranceAt: 0,
    requestedAt: 1,
    startedAt: 2,
  };
  facts.send(action);
  const message = JSON.parse(channel.send.mock.calls[0][0]);
  expect(message).toMatchObject({
    type: "session.thinking.append",
    delegation_id: null,
  });
  expect(JSON.parse(message.content)).toMatchObject({
    source: "avatar-engine",
    action_id: "action",
    revision: 3,
    status: "started",
  });
  const emit = (id: string) =>
    channel.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          type: "session.thinking.appended",
          client_event_id: id,
        }),
      }),
    );
  emit("unrelated");
  expect(changed).toHaveBeenCalledOnce();
  emit(message.event_id);
  expect(changed.mock.lastCall![0].acknowledgedAt).toBeTypeOf("number");
  facts.send({ ...action, status: "completed" });
  await vi.advanceTimersByTimeAsync(10000);
  expect(changed.mock.lastCall![0].error).toContain("timed out");
  expect(channel.send).toHaveBeenCalledTimes(2);
  facts.close();
});

it("bounds long multilingual conversation context before both runtime contracts", async () => {
  const { conversationWindow } = await import("@/lib/conversation-window");
  const messages = Array.from({ length: 80 }, (_, i) => ({
    id: String(i),
    role: i % 2 ? ("user" as const) : ("assistant" as const),
    content: "ሰላም👋".repeat(2000),
  }));
  const window = conversationWindow(messages);
  expect(
    new TextEncoder().encode(window.map((m) => m.content).join("")).length,
  ).toBeLessThanOrEqual(7000);
  expect(window.at(-1)?.id).toBe("79");
  expect(window.at(-1)?.content).not.toContain("\ufffd");
  const context = bodyContext(
    { ready: () => true, pose: restPose } as MotionController,
    messages,
    { still: false },
  );
  expect(
    JSON.stringify({
      data: context.view.data,
      state: context.view.state,
      extensions: {},
    }).replace(/[^\x00-\x7f]/g, "\\u0000").length,
  ).toBeLessThan(32000);
});

it("keeps a bounded late response readable after logical cancellation for receipt cleanup", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const abort = new AbortController();
  const decision = bodyTransport.decide(input, abort.signal);
  abort.abort();
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
  finish(
    Response.json({
      content: null,
      decision: "pending",
      pending_tool_call: pending,
    }),
  );
  expect(await decision).toEqual(pending);
});
