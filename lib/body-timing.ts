import { z } from "zod";

const time = z.number().finite().nonnegative();
const action = z.object({
  id: z.string(),
  utteranceId: z.string().optional(),
  label: z.string().max(120),
  status: z.enum([
    "requested",
    "started",
    "ongoing",
    "completed",
    "canceled",
    "failed",
    "held",
  ]),
  utteranceAt: time,
  requestedAt: time,
  toolReturnedAt: time.optional(),
  startedAt: time.optional(),
  endedAt: time.optional(),
});
const trace = z.object({ actions: z.array(z.unknown()).max(100) });
const pulse = z.object({
  calls: z.number().int().nonnegative(),
  at: time,
  latencyMs: time,
  line: z.string().max(200),
  verdict: z.string().max(300),
  outcome: z.string().max(200),
  error: z.string().max(300).optional(),
});
const pulses = z.object({ pulses: z.array(z.unknown()).max(60) });
function duration(start?: number, end?: number) {
  return start !== undefined && end !== undefined && end >= start
    ? end - start
    : undefined;
}

// Saved traces predate this view and are untrusted browser data. Omitted or
// invalid timing must never appear as a measured zero or a completed motion.
export function bodyTimingRows(body: unknown) {
  const parsed = trace.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.actions
    .slice(-8)
    .reverse()
    .flatMap((value) => {
      const parsedAction = action.safeParse(value);
      if (!parsedAction.success) return [];
      const a = parsedAction.data;
      const local = a.utteranceId === "local-control";
      return [
        {
          id: a.id,
          label: a.label,
          status: a.status,
          wait: local ? undefined : duration(a.utteranceAt, a.requestedAt),
          planning: duration(a.requestedAt, a.toolReturnedAt),
          start: duration(a.toolReturnedAt, a.startedAt),
          movement: duration(a.startedAt, a.endedAt),
        },
      ];
    });
}

/** The expression loop's Jev round trips, newest first; untrusted saved data. */
export function jevPulseRows(body: unknown) {
  const parsed = pulses.safeParse(body);
  if (!parsed.success) return [];
  return parsed.data.pulses
    .slice(-12)
    .reverse()
    .flatMap((value) => {
      const p = pulse.safeParse(value);
      return p.success ? [p.data] : [];
    });
}

export function formatBodyDuration(ms?: number) {
  if (ms === undefined) return "—";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
