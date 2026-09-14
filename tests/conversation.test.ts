import { afterEach, expect, it, vi } from "vitest";
import { createActor, waitFor } from "xstate";
import { conversationMachine } from "@/machines/conversationMachine";
import { restPose } from "@/lib/motion";
import type { MotionController } from "@/types/avatar";

afterEach(() => vi.unstubAllGlobals());
it("performs a pending call once, returns its receipt, and updates the same assistant message", async () => {
  let capture = 0;
  const execute = vi.fn(async () => ({
    status: "completed" as const,
    pose: restPose(),
    constrained: false,
    duration: 1,
  }));
  const controller: MotionController = {
    execute,
    ready: () => true,
    pose: restPose,
    stop: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    capture: () => ({
      dataUri: `data:image/jpeg;base64,frame${++capture}`,
      capturedAt: new Date().toISOString(),
      width: 320,
      height: 512,
    }),
  };
  const pending = {
    tool_name: "move_avatar",
    call_id: "motion-1",
    arguments: { waypoints: [{ time: 1, head: { yaw: 0.2, nod: 0.1 } }] },
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        content: "Let me try.",
        message_id: "reply-1",
        pending_tool_call: pending,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        content: "Let me try.",
        message_id: "reply-1",
        pending_tool_call: pending,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        content: "Hello! What is on your mind?",
        message_id: "reply-1",
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const actor = createActor(conversationMachine, {
    input: { controller },
  }).start();
  await waitFor(actor, (s) => s.matches("idle"));
  actor.send({ type: "SEND", content: "Please greet me." });
  await waitFor(actor, (s) => s.matches("idle"));
  expect(execute).toHaveBeenCalledTimes(1);
  const continuation = JSON.parse(fetchMock.mock.calls[1][1].body);
  expect(continuation.tool_call_id).toBe("motion-1");
  expect(continuation.tool_result.status).toBe("completed");
  expect(continuation.content).toBe("");
  expect(
    JSON.parse(fetchMock.mock.calls[0][1].body).host_context.attachments[0]
      .data_uri,
  ).toBe("data:image/jpeg;base64,frame1");
  expect(continuation.host_context.attachments).toMatchObject([
    { purpose: "screenshot", data_uri: "data:image/jpeg;base64,frame2" },
  ]);
  expect(actor.getSnapshot().context.current.messages).toHaveLength(2);
  expect(actor.getSnapshot().context.current.messages[1].content).toBe(
    "Hello! What is on your mind?",
  );
  actor.stop();
});
it("does not let a late response execute movement after cancellation", async () => {
  let resolveRequest!: (value: Response) => void;
  const execute = vi.fn();
  const controller: MotionController = {
    execute,
    ready: () => true,
    pose: restPose,
    stop: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
  };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          }),
      )
      .mockResolvedValue(Response.json({ cancelled: true })),
  );
  const actor = createActor(conversationMachine, {
    input: { controller },
  }).start();
  await waitFor(actor, (s) => s.matches("idle"));
  actor.send({ type: "SEND", content: "Raise a hand" });
  actor.send({ type: "STOP" });
  await waitFor(actor, (s) => s.matches("idle"));
  resolveRequest(
    Response.json({
      pending_tool_call: {
        tool_name: "move_avatar",
        call_id: "late",
        arguments: { waypoints: [{ time: 1 }] },
      },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(execute).not.toHaveBeenCalled();
  expect(controller.stop).toHaveBeenCalledOnce();
  actor.stop();
});
