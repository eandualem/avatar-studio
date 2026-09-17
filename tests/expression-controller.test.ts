import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ExpressionController,
  expressionQuestions,
} from "@/lib/expression-controller";
import { expressionLines } from "@/lib/expression-lines";
import { seedGestures } from "@/lib/gesture-library";
import type { BodyAction, BodyTransport } from "@/lib/body-controller";
import type { Oracle } from "@/lib/jev";
import { restPose } from "@/lib/motion";
import type { MotionController, MotionResult } from "@/types/avatar";
import type { JevAnswers } from "@/types/jev";
import type { Pending } from "@/types/conversation";

type Verdict = Partial<{
  intent: "explicit" | "incidental" | "none";
  start: number;
  gesture: string;
  confidence: number;
  covered: number;
  stop: number;
  energy: number;
  sustain: number;
  body_language: string;
  body_probability: number;
}>;
function answers(v: Verdict): JevAnswers {
  const intent = v.intent ?? "none";
  return {
    intent: {
      type: "choice",
      choice: intent,
      confidence: 0.95,
      probabilities: { [intent]: 0.95 },
    },
    start: { type: "noul", noul: v.start ?? 0 },
    gesture: {
      type: "choice",
      choice: v.gesture ?? "rest",
      confidence: v.confidence ?? 0.9,
      probabilities: { [v.gesture ?? "rest"]: v.confidence ?? 0.9 },
    },
    covered: { type: "noul", noul: v.covered ?? 0.9 },
    stop: { type: "noul", noul: v.stop ?? 0 },
    energy: {
      type: "score",
      score: v.energy ?? 1.5,
      confidence: 0.6,
      probabilities: { "1": 0.5, "2": 0.5 },
    },
    sustain: {
      type: "score",
      score: v.sustain ?? 1,
      confidence: 0.6,
      probabilities: { "1": 1 },
    },
    body_language: {
      type: "choice",
      choice: v.body_language ?? "none",
      confidence: 0.8,
      probabilities: { [v.body_language ?? "none"]: v.body_probability ?? 0.8 },
    },
  };
}
const line = (role: "user" | "assistant", text: string, id = text) => ({
  id: `${role}:${id}`,
  role,
  text,
});
const result: MotionResult = {
  status: "completed",
  pose: restPose(),
  duration: 1,
  constrained: false,
};
const plan: Pending = {
  tool_name: "move_avatar",
  call_id: "plan",
  arguments: {
    intent: "explicit",
    label: "Touch toes",
    waypoints: [{ time: 0.5, torso: { bend: 0.4, twist: 0, lean: 0 } }],
  },
};
function setup(options = {}) {
  const motion: MotionController = {
    attach: vi.fn(),
    detach: vi.fn(),
    pose: restPose,
    ready: () => true,
    stop: vi.fn(),
    reset: vi.fn(restPose),
    execute: vi.fn(async (_m, _s, started) => {
      started?.();
      return result;
    }),
  };
  const oracle: Oracle = { ask: vi.fn(async () => answers({})) };
  const planner: BodyTransport = {
    decide: vi.fn(async () => plan),
    receipt: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  const fact = vi.fn<(action: BodyAction) => void>(),
    warning = vi.fn();
  const body = new ExpressionController(
    motion,
    oracle,
    planner,
    vi.fn(),
    fact,
    warning,
    options,
  );
  return { body, motion, oracle, planner, fact, warning };
}
const store = new Map<string, string>();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("continuous expression from the transcript", () => {
  it("asks Jev on every change with the library as options and performs the chosen gesture once per line", async () => {
    const { body, motion, oracle } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.93, gesture: "clap", energy: 2 }),
    );
    body.observe([line("user", "can you")], false);
    body.observe([line("user", "can you clap", "can you")], false);
    await vi.advanceTimersByTimeAsync(300);
    expect(oracle.ask).toHaveBeenCalledTimes(2);
    const [state, questions] = vi.mocked(oracle.ask).mock.calls[0];
    expect(Object.keys(questions)).toEqual([
      "intent",
      "start",
      "gesture",
      "covered",
      "stop",
      "energy",
      "sustain",
      "body_language",
    ]);
    expect(
      questions.body_language.type === "choice" &&
        Object.keys(questions.body_language.criteria),
    ).toContain("none");
    expect(
      questions.gesture.type === "choice" &&
        Object.keys(questions.gesture.criteria),
    ).toContain("not_in_library");
    expect(state).toMatchObject({
      conversation: [
        {
          speaker: "user",
          text: "can you",
          transcript: "partial, still speaking",
        },
      ],
      charlie: {
        body: "standing at rest",
        performed_for_latest_user_line: [],
        library: expect.arrayContaining([expect.stringMatching(/^clap: /)]),
      },
    });
    expect(motion.execute).toHaveBeenCalledOnce();
    const [executed] = vi.mocked(motion.execute).mock.calls[0];
    expect(executed.repeat).toBe(3);
    expect(executed.prepare![0].time).toBeCloseTo(0.94, 2);
    // The settled line asks again with the performed gesture in state; no repeat.
    await vi.advanceTimersByTimeAsync(900);
    expect(oracle.ask).toHaveBeenCalledTimes(3);
    expect(vi.mocked(oracle.ask).mock.calls[2][0]).toMatchObject({
      conversation: [{ transcript: "complete" }],
      charlie: { performed_for_latest_user_line: ["clap"] },
    });
    expect(motion.execute).toHaveBeenCalledOnce();
    const action = body.snapshot().actions[0];
    expect(action).toMatchObject({
      label: "clap",
      intent: "explicit",
      status: "completed",
    });
    expect(body.snapshot().pulse).toMatchObject({
      calls: 3,
      verdict: expect.stringContaining("clap"),
      outcome: expect.stringContaining("clap already performed for this line"),
    });
    expect(body.snapshot().pulses?.[0].outcome).toBe(
      "explicit clap, energy 2.0",
    );
  });
  it("keeps an explicit request explicit across Charlie's reply, at the lower partial bar", async () => {
    const { body, motion, oracle } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "explicit",
        start: 0.65,
        gesture: "wave",
        confidence: 0.6,
      }),
    );
    body.observe([line("user", "can you wave")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).not.toHaveBeenCalled();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "explicit",
        start: 0.72,
        gesture: "wave",
        confidence: 0.6,
      }),
    );
    body.observe(
      [line("user", "can you wave"), line("assistant", "Sure, I'm")],
      true,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(body.snapshot().actions[0]).toMatchObject({
      label: "wave",
      intent: "explicit",
    });
    expect(body.snapshot().pulse?.outcome).toContain(
      "explicit wave, energy 1.5",
    );
  });
  it("sends an explicit request the library does not cover to the planner, even when Jev names the nearest entry", async () => {
    const { body, motion, oracle, planner } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "explicit",
        start: 0.9,
        gesture: "wave",
        covered: 0.04,
      }),
    );
    body.observe([line("user", "wave with both hands")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.decide).toHaveBeenCalledOnce();
    expect(body.snapshot().pulse?.outcome).toContain(
      "planner asked (covered 0.04)",
    );
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(vi.mocked(motion.execute).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        waypoints: (plan.arguments as { waypoints: unknown }).waypoints,
      }),
    );
    // The settled line offers the learned entry; it was just performed, so no repeat.
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.9, gesture: "touch_toes" }),
    );
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(body.snapshot().pulse?.outcome).toContain(
      "touch_toes already performed for this line",
    );
  });
  it("waits for a partial line to settle before a moderately confident start, and never repeats the same state", async () => {
    const { body, motion, oracle } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "incidental", start: 0.7, gesture: "wave" }),
    );
    body.observe([line("user", "hey Charlie")], false);
    await vi.advanceTimersByTimeAsync(100);
    expect(motion.execute).not.toHaveBeenCalled();
    body.observe([line("user", "hey Charlie")], false);
    await vi.advanceTimersByTimeAsync(100);
    expect(oracle.ask).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(800);
    expect(oracle.ask).toHaveBeenCalledTimes(2);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(body.snapshot().actions[0].intent).toBe("incidental");
  });
  it("reacts to Charlie's own speech as incidental and respects cooldown and explicit priority", async () => {
    const { body, motion, oracle } = setup();
    vi.mocked(motion.execute).mockImplementationOnce((_m, signal, started) => {
      started?.();
      return new Promise((resolve) =>
        signal?.addEventListener("abort", () =>
          resolve({ ...result, status: "interrupted" }),
        ),
      );
    });
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.95, gesture: "run_in_place" }),
    );
    body.observe([line("user", "run!")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(body.snapshot().active?.label).toBe("run_in_place");
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "none", start: 0.9, gesture: "laugh" }),
    );
    body.observe(
      [line("user", "run!"), line("assistant", "Here I go, ha!")],
      true,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(vi.mocked(oracle.ask).mock.lastCall![0]).toMatchObject({
      charlie: {
        speaking_now: true,
        body: expect.stringContaining("run_in_place (explicit)"),
      },
    });
    body.stop();
    expect(body.snapshot().still).toBe(true);
    body.observe(
      [
        line("user", "run!"),
        line("assistant", "Here I go, ha!"),
        line("user", "haha", "u2"),
      ],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledOnce();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.9, gesture: "laugh" }),
    );
    body.observe([line("user", "laugh for me", "u3")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    expect(body.snapshot().still).toBe(false);
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "incidental", start: 0.9, gesture: "laugh" }),
    );
    body.observe([line("user", "that was funny", "u4")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(7000);
    body.observe([line("user", "so funny", "u5")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledTimes(3);
  });
  it("stops on a confident stop from the user only, and holds until an explicit request", async () => {
    const { body, motion, oracle, fact } = setup();
    vi.mocked(motion.execute).mockImplementationOnce((_m, signal, started) => {
      started?.();
      return new Promise((resolve) =>
        signal?.addEventListener("abort", () =>
          resolve({ ...result, status: "interrupted" }),
        ),
      );
    });
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.95, gesture: "clap" }),
    );
    body.observe([line("user", "clap")], false);
    await vi.advanceTimersByTimeAsync(10);
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ stop: 0.97, gesture: "clap" }),
    );
    body.observe([line("user", "clap"), line("assistant", "stop? no")], true);
    await vi.advanceTimersByTimeAsync(10);
    expect(body.snapshot().active?.label).toBe("clap");
    body.observe(
      [
        line("user", "clap"),
        line("assistant", "stop? no"),
        line("user", "okay stop", "u2"),
      ],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(body.snapshot().active).toBeUndefined();
    expect(body.snapshot().still).toBe(true);
    expect(fact.mock.calls.map(([a]) => a.status)).toEqual([
      "started",
      "canceled",
      "held",
    ]);
    expect(motion.stop).toHaveBeenCalled();
  });
  it("asks the planner when Jev finds nothing in the library, executes the plan and learns it", async () => {
    const { body, motion, oracle, planner } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.9, gesture: "not_in_library" }),
    );
    body.observe([line("user", "touch your toes")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.decide).toHaveBeenCalledOnce();
    const [request] = vi.mocked(planner.decide).mock.calls[0];
    expect(request.host_context.view.data.conversation).toEqual([
      { id: "user:touch your toes", role: "user", content: "touch your toes" },
    ]);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(planner.receipt).toHaveBeenCalledWith(request, plan, { result });
    expect(body.snapshot().actions[0]).toMatchObject({
      label: "Touch toes",
      status: "completed",
      detail: "Learned as touch_toes",
    });
    expect(
      JSON.parse(store.get("avatar-studio.gesture-library")!),
    ).toMatchObject([{ name: "touch_toes", examples: ["touch your toes"] }]);
    // The learned gesture is offered to Jev from now on and runs from the library.
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.9, gesture: "touch_toes" }),
    );
    body.observe(
      [line("user", "touch your toes"), line("user", "again", "u2")],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    const [, questions] = vi.mocked(oracle.ask).mock.lastCall!;
    expect(
      questions.gesture.type === "choice" && questions.gesture.criteria,
    ).toHaveProperty("touch_toes");
    expect(planner.decide).toHaveBeenCalledOnce();
    expect(motion.execute).toHaveBeenCalledTimes(2);
    expect(body.snapshot().actions[1].label).toBe("touch_toes");
    // Incidental not-in-library never reaches the planner.
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "incidental", start: 0.9, gesture: "not_in_library" }),
    );
    body.observe([line("user", "nice weather", "u3")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.decide).toHaveBeenCalledOnce();
  });
  it("keeps a plan composing across corrections and repeats, and cancels it for a stop or a request the library serves", async () => {
    const { body, motion, oracle, planner } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "explicit",
        start: 0.9,
        gesture: "not_in_library",
        covered: 0.05,
      }),
    );
    let finish!: (value: Pending) => void;
    vi.mocked(planner.decide).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    body.observe([line("user", "do a cartwheel")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.decide).toHaveBeenCalledOnce();
    // A correction on a new line waits for the plan instead of restarting it.
    body.observe(
      [
        line("user", "do a cartwheel"),
        line("assistant", "On it"),
        line("user", "yes, a cartwheel, I said", "u2"),
      ],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.decide).toHaveBeenCalledOnce();
    expect(body.snapshot().pulse?.outcome).toContain("planner still composing");
    expect(planner.cancel).not.toHaveBeenCalled();
    finish(plan);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(body.snapshot().actions[0]).toMatchObject({
      label: "Touch toes",
      status: "completed",
    });
    // A new uncovered request plans again; an explicit library request cancels that plan.
    body.observe([line("user", "now a handstand", "u3")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.decide).toHaveBeenCalledTimes(2);
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.9, gesture: "clap" }),
    );
    body.observe(
      [
        line("user", "now a handstand", "u3"),
        line("user", "actually just clap", "u4"),
      ],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    expect(vi.mocked(motion.execute).mock.calls[1][0].repeat).toBe(3);
    expect(planner.cancel).toHaveBeenCalledOnce();
    finish(plan);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    expect(planner.receipt).toHaveBeenLastCalledWith(
      expect.anything(),
      plan,
      expect.objectContaining({ outcome: "failed" }),
    );
    expect(body.snapshot().actions[1]).toMatchObject({
      status: "canceled",
      detail: "Superseded by a request the library serves",
    });
    // A stop cancels a plan too.
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "explicit",
        start: 0.9,
        gesture: "not_in_library",
        covered: 0.05,
      }),
    );
    body.observe([line("user", "do a cartwheel", "u5")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.decide).toHaveBeenCalledTimes(3);
    vi.mocked(oracle.ask).mockResolvedValue(answers({ stop: 0.95 }));
    body.observe(
      [line("user", "do a cartwheel", "u5"), line("user", "stop", "u6")],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(planner.cancel).toHaveBeenCalledTimes(2);
    expect(body.snapshot().still).toBe(true);
  });
  it("survives Jev failures, coalesces bursts to one in-flight call, and reconciles snapshots without replay", async () => {
    const { body, motion, oracle, warning } = setup();
    let release!: (a: JevAnswers) => void;
    vi.mocked(oracle.ask).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    body.observe([line("user", "hi")], false);
    body.observe([line("user", "hi there", "hi")], false);
    body.observe([line("user", "hi there Charlie", "hi")], false);
    expect(oracle.ask).toHaveBeenCalledOnce();
    vi.mocked(oracle.ask).mockRejectedValueOnce(
      new Error("Jev is unavailable."),
    );
    release(answers({}));
    await vi.advanceTimersByTimeAsync(300);
    expect(oracle.ask).toHaveBeenCalledTimes(2);
    expect(vi.mocked(oracle.ask).mock.calls[1][0]).toMatchObject({
      conversation: [{ text: "hi there Charlie" }],
    });
    expect(body.snapshot().pulse?.error).toBe("Jev is unavailable.");
    expect(warning).not.toHaveBeenCalled();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.95, gesture: "wave" }),
    );
    body.reconcile([line("user", "wave please", "old")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(motion.execute).not.toHaveBeenCalled();
    body.close();
    body.observe(
      [line("user", "wave please", "old"), line("user", "wave", "new")],
      false,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(motion.execute).not.toHaveBeenCalled();
  });
});

describe("natural expression", () => {
  it("serves an explicit return to rest even when Jev sees no new gesture to start, because the state says which pose is held", async () => {
    const { body, motion, oracle } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.9, gesture: "kick_stance" }),
    );
    body.observe([line("user", "kicking stance")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledOnce();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "explicit",
        start: 0.35,
        gesture: "rest",
        confidence: 0.55,
      }),
    );
    body.observe(
      [
        line("user", "kicking stance"),
        line("user", "go back to natural position", "u2"),
      ],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(vi.mocked(oracle.ask).mock.lastCall![0]).toMatchObject({
      charlie: { body: "holding the pose left by kick_stance; not at rest" },
    });
    // Unclear while partial, served once the line settles.
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(body.snapshot().pulse?.outcome).toContain(
      "request unclear (rest 0.55 < 0.7 partial)",
    );
    await vi.advanceTimersByTimeAsync(900);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    expect(body.snapshot().actions[1]).toMatchObject({
      label: "rest",
      intent: "explicit",
      status: "completed",
    });
    body.observe(
      [
        line("user", "kicking stance"),
        line("user", "go back to natural position", "u2"),
        line("assistant", "Done"),
      ],
      true,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(vi.mocked(oracle.ask).mock.lastCall![0]).toMatchObject({
      charlie: { body: "standing at rest" },
    });
  });
  it("runs small body language while Charlie talks, spaced out, never over a running gesture or stillness", async () => {
    const { body, motion, oracle } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "none",
        body_language: "nod_small",
        body_probability: 0.62,
      }),
    );
    body.observe([line("user", "so the thing is")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(
      vi.mocked(motion.execute).mock.calls[0][0].waypoints[0].head,
    ).toEqual({ yaw: 0, nod: 0.1 });
    expect(body.snapshot().actions[0]).toMatchObject({
      label: "nod_small",
      intent: "incidental",
    });
    expect(body.snapshot().pulse?.outcome).toContain(
      "body language nod_small 0.62",
    );
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "none",
        body_language: "head_tilt",
        body_probability: 0.7,
      }),
    );
    body.observe([line("user", "so the thing is, right")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledOnce();
    expect(body.snapshot().pulse?.outcome).toContain("head_tilt: too soon");
    await vi.advanceTimersByTimeAsync(2600);
    body.observe([line("user", "so the thing is, right, I think")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "none", body_language: "none", body_probability: 0.7 }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    body.observe([line("user", "so the thing is, right, I think so")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(motion.execute).toHaveBeenCalledTimes(2);
    expect(body.snapshot().pulse?.outcome).toContain("stillness 0.70");
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "none",
        body_language: "nod_small",
        body_probability: 0.15,
      }),
    );
    body.observe(
      [line("user", "so the thing is, right, I think so, yes")],
      false,
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(body.snapshot().pulse?.outcome).toContain("nod_small 0.15 < 0.2");
    body.stop();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "none", body_language: "sway", body_probability: 0.9 }),
    );
    body.observe([line("user", "quiet now", "u2")], false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(motion.execute).toHaveBeenCalledTimes(2);
  });
  it("keeps asking during silence so Charlie can idle, and stops at the cap", async () => {
    const { body, oracle } = setup({ idleTickMs: 1000 });
    body.observe([line("user", "okay")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(oracle.ask).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(800);
    expect(oracle.ask).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(oracle.ask).toHaveBeenCalledTimes(3);
    expect(vi.mocked(oracle.ask).mock.lastCall![0]).toMatchObject({
      charlie: { silence_seconds: 2 },
    });
    await vi.advanceTimersByTimeAsync(30000);
    expect(oracle.ask).toHaveBeenCalledTimes(26);
    body.observe([line("user", "okay, back", "u2")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(oracle.ask).toHaveBeenCalledTimes(27);
    expect(vi.mocked(oracle.ask).mock.lastCall![0]).toMatchObject({
      charlie: { silence_seconds: 0 },
    });
  });
  it("gives a planned gesture a way back to rest before running and learning it, and scales cycles with sustain", async () => {
    const { body, motion, oracle, planner } = setup();
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({
        intent: "explicit",
        start: 0.9,
        gesture: "not_in_library",
        covered: 0.05,
      }),
    );
    vi.mocked(planner.decide).mockResolvedValueOnce({
      ...plan,
      arguments: {
        intent: "explicit",
        label: "Wave both arms high",
        waypoints: [{ time: 0.6, left: { position: [0.24, 0.98, 0.04] } }],
      },
    });
    body.observe([line("user", "wave with both hands")], false);
    await vi.advanceTimersByTimeAsync(10);
    const executed = vi.mocked(motion.execute).mock.calls[0][0];
    expect(executed.finish).toHaveLength(1);
    expect(
      JSON.parse(store.get("avatar-studio.gesture-library")!)[0].motion.finish,
    ).toHaveLength(1);
    vi.mocked(oracle.ask).mockResolvedValue(
      answers({ intent: "explicit", start: 0.9, gesture: "clap", sustain: 2 }),
    );
    body.observe([line("user", "keep clapping", "u2")], false);
    await vi.advanceTimersByTimeAsync(10);
    expect(vi.mocked(motion.execute).mock.calls[1][0].repeat).toBe(5);
  });
});

it("groups fragments into lines per speaker and keeps a growing user line's identity", () => {
  const lines = expressionLines("c", [
    { role: "user", delta: "can you", start_ms: 0, end_ms: 400 },
    { role: "user", delta: " clap", start_ms: 500, end_ms: 800 },
    { role: "assistant", delta: "Sure", start_ms: 900, end_ms: 1200 },
    { role: "user", delta: "thanks", start_ms: 4000, end_ms: 4300 },
    { role: "user", delta: "   ", start_ms: 4400, end_ms: 4500 },
  ]);
  expect(lines).toEqual([
    { id: "line:c:0", role: "user", text: "can you clap" },
    { id: "line:c:2", role: "assistant", text: "Sure" },
    { id: "line:c:3", role: "user", text: "thanks   " },
  ]);
  expect(
    expressionLines(
      "c",
      Array.from({ length: 12 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        delta: `l${i}`,
        start_ms: i * 3000,
        end_ms: i * 3000 + 100,
      })) as never,
    ),
  ).toHaveLength(8);
  expect(
    Object.keys(
      expressionQuestions(seedGestures).gesture.type === "choice"
        ? (expressionQuestions(seedGestures).gesture as { criteria: object })
            .criteria
        : {},
    ),
  ).toHaveLength(seedGestures.length + 1);
});
