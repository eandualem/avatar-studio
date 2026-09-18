import { beforeAll, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { initializeContacts } from "@/lib/body/collision";
import {
  endsAtRest,
  forgetLearned,
  gestureName,
  learnGesture,
  learnedCount,
  learnedGestures,
  libraryCriteria,
  microGestures,
  normalizeLearned,
  seedGestures,
  shapeGesture,
  subscribeLibrary,
} from "@/lib/gesture-library";
import { motionSchema } from "@/types/avatar";
import { runOnRig } from "./fixtures/rig";

beforeAll(initializeContacts);
const near = (a: number[], b: number[], tolerance: number) =>
  expect(new Vector3(...a).distanceTo(new Vector3(...b))).toBeLessThan(
    tolerance,
  );

describe("every library entry runs on the shipped skeleton", () => {
  it.each([...seedGestures, ...microGestures])("$name", async (gesture) => {
    motionSchema.parse(gesture.motion);
    const run = await runOnRig(gesture.motion);
    expect(run.problems).toEqual([]);
    expect(run.duration).toBeLessThan(20);
    near(run.pose.left.position, run.target.left.position, 0.02);
    near(run.pose.right.position, run.target.right.position, 0.02);
    expect(run.pose.head).toEqual(run.target.head);
  });
});

it("shapes tempo and cycles from energy and sustain and stays valid", () => {
  const clap = seedGestures.find((g) => g.name === "clap")!;
  const calm = shapeGesture(clap, 0),
    lively = shapeGesture(clap, 3);
  expect(calm.repeat).toBeLessThan(lively.repeat!);
  expect(calm.waypoints[0].time).toBeGreaterThan(lively.waypoints[0].time);
  expect(shapeGesture(clap, Number.NaN).repeat).toBe(3);
  expect(shapeGesture(clap, 1.5, 2).repeat).toBeGreaterThan(
    shapeGesture(clap, 1.5, 0).repeat!,
  );
  for (const gesture of [...seedGestures, ...microGestures])
    for (const energy of [0, 1.5, 3])
      for (const sustain of [0, 2])
        motionSchema.parse(shapeGesture(gesture, energy, sustain));
});

it("knows which plans end at rest and gives learned gestures a way home", () => {
  const byName = (name: string) =>
    seedGestures.find((g) => g.name === name)!.motion;
  expect(endsAtRest(byName("wave"))).toBe(true);
  expect(endsAtRest(byName("clap"))).toBe(true);
  expect(endsAtRest(byName("kick_stance"))).toBe(false);
  expect(endsAtRest(byName("thinking"))).toBe(false);
  const raised = {
    waypoints: [
      {
        time: 0.6,
        left: { position: [0.24, 0.98, 0.04] as [number, number, number] },
      },
    ],
  };
  expect(normalizeLearned("Wave both hands", raised).finish).toHaveLength(1);
  expect(
    normalizeLearned("Supported forward kicking pose", raised).finish,
  ).toBeUndefined();
  expect(normalizeLearned("Wave", byName("wave"))).toEqual(byName("wave"));
});

it("names learned gestures safely and keeps them out of the seed list", () => {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
  expect(gestureName("Touch toes!")).toBe("touch_toes");
  expect(
    learnGesture({
      name: "clap",
      what: "",
      examples: [],
      motion: seedGestures[0].motion,
    }),
  ).toBe(false);
  expect(
    learnGesture({
      name: "touch_toes",
      what: "Bend and touch the toes",
      examples: ["touch your toes"],
      motion: {
        waypoints: [{ time: 0.5, torso: { bend: 0.4, twist: 0, lean: 0 } }],
      },
    }),
  ).toBe(true);
  expect(learnedGestures().map((g) => g.name)).toEqual(["touch_toes"]);
  expect(
    Object.keys(libraryCriteria([...seedGestures, ...learnedGestures()])),
  ).toContain("not_in_library");
  store.set("avatar-studio.gesture-library", '[{"name":"bad","motion":{}}]');
  expect(learnedGestures()).toEqual([]);
  Object.assign(globalThis.localStorage, {
    removeItem: (k: string) => store.delete(k),
  });
  store.set("avatar-studio.gesture-library", "[]");
  const listener = vi.fn();
  const unsubscribe = subscribeLibrary(listener);
  forgetLearned();
  expect(store.has("avatar-studio.gesture-library")).toBe(false);
  expect(listener).toHaveBeenCalledOnce();
  expect(learnedCount()).toBe(0);
  unsubscribe();
});
