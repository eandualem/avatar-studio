import { bodyTimingRows, formatBodyDuration } from "@/lib/body-timing";

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
  if (!rows.length) return null;
  return (
    <details className="body-timing">
      <summary>Body timing</summary>
      <p>
        Latest decisions first. Speech wait follows the latest transcript
        update; planning includes the runtime request. Start delay ends at the
        first movement frame.
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
  );
}
