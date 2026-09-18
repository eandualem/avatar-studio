import { describe, expect, it } from "vitest";
import { bodyTimingRows } from "@/lib/body-timing";

const wave = {
  id: "wave",
  label: "A short wave",
  status: "completed",
  utteranceAt: 1000,
  requestedAt: 1900,
  toolReturnedAt: 6600,
  startedAt: 6618,
  endedAt: 11618,
};

describe("Body timing from saved engine evidence", () => {
  it("separates speech wait, planning, first frame and motion", () => {
    expect(bodyTimingRows({ actions: [wave] })).toEqual([
      {
        id: "wave",
        label: "A short wave",
        status: "completed",
        wait: 900,
        planning: 4700,
        start: 18,
        movement: 5000,
      },
    ]);
  });
  it("does not invent a model return or engine start for canceled planning", () => {
    const canceled = {
      ...wave,
      status: "canceled",
      toolReturnedAt: undefined,
      startedAt: undefined,
      endedAt: 3000,
    };
    expect(bodyTimingRows({ actions: [canceled] })[0]).toMatchObject({
      wait: 900,
      planning: undefined,
      start: undefined,
      movement: undefined,
    });
  });
  it("displays partial legacy evidence without claiming negative or missing durations", () => {
    expect(
      bodyTimingRows({
        actions: [{ ...wave, startedAt: 6500, endedAt: undefined }],
      })[0],
    ).toMatchObject({ planning: 4700, start: undefined, movement: undefined });
    expect(
      bodyTimingRows({
        actions: [null, { ...wave, requestedAt: "1900" }, wave],
      }),
    ).toHaveLength(1);
    expect(bodyTimingRows({})).toEqual([]);
    expect(bodyTimingRows(null)).toEqual([]);
  });
  it("keeps local Stop distinct from a zero-latency model decision and bounds history", () => {
    const stop = {
      ...wave,
      id: "stop",
      utteranceId: "local-control",
      label: "Stopped",
      status: "held",
      utteranceAt: 12000,
      requestedAt: 12000,
      toolReturnedAt: undefined,
      startedAt: undefined,
      endedAt: 12000,
    };
    const rows = bodyTimingRows({
      actions: [
        ...Array.from({ length: 12 }, (_, i) => ({ ...wave, id: String(i) })),
        stop,
      ],
    });
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({
      id: "stop",
      wait: undefined,
      planning: undefined,
      start: undefined,
      movement: undefined,
    });
  });
});

it("lists Jev round trips newest first and drops rows a saved trace cannot vouch for", async () => {
  const { jevPulseRows } = await import("@/lib/body-timing");
  const pulse = (calls: number) => ({
    calls,
    at: calls * 1000,
    latencyMs: 400,
    line: "user: hi",
    verdict: "wave 0.7",
    outcome: "incidental wave",
  });
  expect(
    jevPulseRows({ pulses: [pulse(1), { calls: "x" }, pulse(2)] }).map(
      (p) => p.calls,
    ),
  ).toEqual([2, 1]);
  expect(jevPulseRows({ actions: [] })).toEqual([]);
});
