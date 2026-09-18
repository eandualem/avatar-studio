import {
  bodyTimingRows,
  formatBodyDuration,
  jevPulseRows,
} from "@/lib/body-timing";

const outcomes = {
  requested: "Planning",
  started: "Started",
  ongoing: "Moving",
  completed: "Completed",
  canceled: "Canceled",
  failed: "Failed",
  held: "No new movement",
};

export function BodyTiming({ body }: { body: unknown }) {
  const rows = bodyTimingRows(body);
  const pulses = jevPulseRows(body);
  if (!rows.length && !pulses.length) return null;
  return (
    <>
      {pulses.length > 0 && (
        <details className="body-timing">
          <summary>Jev decisions</summary>
          <p>
            Newest first: time into the call, Jev&apos;s latency, the line it
            saw (… while still being spoken), its answers, and what the
            controller did.
          </p>
          <ol aria-label="Jev decisions">
            {pulses.map((p) => (
              <li key={p.calls}>
                <div className="body-timing-title">
                  <strong>
                    #{p.calls} · {formatBodyDuration(p.at)} · {p.line}
                  </strong>
                  <span>{formatBodyDuration(p.latencyMs)}</span>
                </div>
                <p>{p.error ?? p.verdict}</p>
                <p>→ {p.outcome}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
      {rows.length > 0 && (
        <details className="body-timing">
          <summary>Body timing</summary>
          <p>
            Latest decisions first. Speech wait follows the latest transcript
            update; planning includes the runtime request. Start delay ends at
            the first movement frame.
          </p>
          <ol aria-label="Body timing breakdown">
            {rows.map((row) => (
              <li key={row.id}>
                <div className="body-timing-title">
                  <strong>{row.label}</strong>
                  <span>{outcomes[row.status]}</span>
                </div>
                <dl>
                  {(
                    [
                      ["Speech wait", row.wait],
                      ["Planning", row.planning],
                      ["Start delay", row.start],
                      ["Movement", row.movement],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        {value === undefined &&
                        label === "Planning" &&
                        row.status === "requested"
                          ? "Pending"
                          : formatBodyDuration(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
