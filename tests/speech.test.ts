import { afterEach, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { speechMachine } from "@/machines/speechMachine";
import type { Recognition } from "@/lib/dictation";
afterEach(() => vi.unstubAllGlobals());
it("delivers editable dictation and releases the microphone on stop", () => {
  const instances: Recognition[] = [];
  const abort = vi.fn();
  class FakeRecognition implements Recognition {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: Recognition["onresult"] = null;
    onerror: Recognition["onerror"] = null;
    onend: Recognition["onend"] = null;
    constructor() {
      instances.push(this);
    }
    start() {}
    stop() {}
    abort = abort;
  }
  vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
  vi.stubGlobal("navigator", { language: "en-US" });
  const actor = createActor(speechMachine).start();
  actor.send({ type: "START" });
  const recognition = instances[0];
  expect(actor.getSnapshot().matches("listening")).toBe(true);
  recognition.onresult!({
    results: {
      length: 1,
      0: { isFinal: true, 0: { transcript: "Hello Charlie" } },
    },
  });
  expect(actor.getSnapshot().context.transcript).toBe("Hello Charlie");
  actor.send({ type: "STOP" });
  expect(abort).toHaveBeenCalledOnce();
  expect(recognition.onresult).toBeNull();
  actor.stop();
});
it("exposes permission denial without sending a message", () => {
  const instances: Recognition[] = [];
  class DeniedRecognition implements Recognition {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: Recognition["onresult"] = null;
    onerror: Recognition["onerror"] = null;
    onend: Recognition["onend"] = null;
    constructor() {
      instances.push(this);
    }
    start() {}
    stop() {}
    abort() {}
  }
  vi.stubGlobal("window", { SpeechRecognition: DeniedRecognition });
  vi.stubGlobal("navigator", { language: "en-US" });
  const actor = createActor(speechMachine).start();
  actor.send({ type: "START" });
  const recognition = instances[0];
  recognition.onerror!({ error: "not-allowed" });
  expect(actor.getSnapshot().matches("idle")).toBe(true);
  expect(actor.getSnapshot().context.error).toContain(
    "permission was declined",
  );
  expect(actor.getSnapshot().context.transcript).toBe("");
  actor.stop();
});
