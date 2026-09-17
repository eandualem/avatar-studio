import { beforeAll, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { initializeContacts } from "@/lib/body/collision";
import {
  gestureName,
  learnGesture,
  learnedGestures,
  libraryCriteria,
  seedGestures,
  shapeGesture,
} from "@/lib/gesture-library";
import { motionSchema } from "@/types/avatar";
import { runOnRig } from "./fixtures/rig";

beforeAll(initializeContacts);
const near = (a: number[], b: number[], tolerance: number) =>
  expect(new Vector3(...a).distanceTo(new Vector3(...b))).toBeLessThan(
    tolerance,
  );

describe("every library entry runs on the shipped skeleton", () => {
  it.each(seedGestures)("$name", async (gesture) => {
    motionSchema.parse(gesture.motion);
    const run = await runOnRig(gesture.motion);
    expect(run.problems).toEqual([]);
    expect(run.duration).toBeLessThan(20);
    near(run.pose.left.position, run.target.left.position, 0.02);
    near(run.pose.right.position, run.target.right.position, 0.02);
    expect(run.pose.head).toEqual(run.target.head);
  });
});

it("shapes tempo and cycles from energy and stays valid", () => {
  const clap = seedGestures.find((g) => g.name === "clap")!;
  const calm = shapeGesture(clap, 0), lively = shapeGesture(clap, 3);
  expect(calm.repeat).toBeLessThan(lively.repeat!);
  expect(calm.waypoints[0].time).toBeGreaterThan(lively.waypoints[0].time);
  expect(shapeGesture(clap, Number.NaN).repeat).toBe(3);
  for (const gesture of seedGestures)
    for (const energy of [0, 1.5, 3]) motionSchema.parse(shapeGesture(gesture, energy));
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
  expect(learnGesture({ name: "clap", what: "", examples: [], motion: seedGestures[0].motion })).toBe(false);
  expect(
    learnGesture({
      name: "touch_toes",
      what: "Bend and touch the toes",
      examples: ["touch your toes"],
      motion: { waypoints: [{ time: 0.5, torso: { bend: 0.4, twist: 0, lean: 0 } }] },
    }),
  ).toBe(true);
  expect(learnedGestures().map((g) => g.name)).toEqual(["touch_toes"]);
  expect(Object.keys(libraryCriteria([...seedGestures, ...learnedGestures()]))).toContain("not_in_library");
  store.set("avatar-studio.gesture-library", '[{"name":"bad","motion":{}}]');
  expect(learnedGestures()).toEqual([]);
});
