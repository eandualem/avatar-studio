"use client";
import { useState } from "react";
import Image from "next/image";
import { Play, Square, Copy, RotateCcw } from "lucide-react";
import { useMotionLab } from "@/hooks/useStudio";
import { motionExamples, previewMotion } from "@/lib/motion-lab";
import { forgetLearned, learnedGestures } from "@/lib/gesture-library";
import { actions } from "@/lib/host-tools";
import type { MotionResult } from "@/types/avatar";

function numericFields(
  value: unknown,
  path: string[] = [],
): { path: string[]; value: number }[] {
  if (typeof value === "number") return [{ path, value }];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    numericFields(child, [...path, key]),
  );
}
// "left · position · 1" reads as "left · position · y"; curls name the finger.
const AXES = ["x", "y", "z"];
const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];
function fieldLabel(path: string[]) {
  const index = Number(path.at(-1));
  const parent = path.at(-2);
  const names =
    parent === "position" || parent === "offset" || parent === "direction"
      ? AXES
      : parent === "curls"
        ? FINGERS
        : undefined;
  return (names ? [...path.slice(0, -1), names[index]] : path).join(" · ");
}

export function MotionLab({ ready }: { ready: boolean }) {
  const lab = useMotionLab();
  const [source, setSource] = useState(
    JSON.stringify(motionExamples[0].motion, null, 2),
  );
  const [example, setExample] = useState(0);
  const [point, setPoint] = useState(0);
  const [section, setSection] = useState("waypoints");
  const [copyStatus, setCopyStatus] = useState("");
  const preview = previewMotion(source, lab.pose);
  // Keep numeric fields editable even when a value is outside the tool limits.
  let editable: Record<string, unknown>[] = [];
  try {
    const raw = JSON.parse(source)[section];
    if (
      Array.isArray(raw) &&
      raw.length <= 16 &&
      raw.every((p) => p && typeof p === "object" && !Array.isArray(p))
    )
      editable = raw;
  } catch {
    /* The JSON editor remains available for malformed input. */
  }
  const selected = editable[point];
  // The last receipt: a MotionResult, or an error/reset/capture shape.
  const result = lab.report?.receipt.result as
    | (Partial<Omit<MotionResult, "status">> & {
        status?: MotionResult["status"] | "reset";
        error?: string;
        screenshot?: string;
        width?: number;
        height?: number;
      })
    | undefined;
  const timing = result?.timing;
  const updateNumber = (path: string[], value: number) => {
    const next = JSON.parse(source);
    let target = next[section][point];
    for (const part of path.slice(0, -1)) target = target[part];
    target[path.at(-1)!] = value;
    setSource(JSON.stringify(next, null, 2));
  };
  return (
    <section
      id="motion-lab"
      className="motion-lab"
      aria-label="Direct movement testing"
      hidden={!lab.active}
    >
      <p className="lab-intro">
        Call the same tools Charlie uses, directly in your browser. Chat and
        live calls pause while Dev test is open.
      </p>
      <label className="lab-label">
        Start from an example
        <select
          value={example}
          disabled={lab.running}
          onChange={(event) => {
            const index = Number(event.target.value);
            setExample(index);
            setSection("waypoints");
            setPoint(0);
            setSource(JSON.stringify(motionExamples[index].motion, null, 2));
          }}
        >
          {motionExamples.map((item, index) => (
            <option key={item.name} value={index}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p className="lab-hint">{motionExamples[example].hint}</p>
      <p className="lab-hint">
        Learned movements in this browser: {learnedGestures().length}.{" "}
        <button
          type="button"
          onClick={() => {
            forgetLearned();
            setCopyStatus("Learned movements forgotten");
          }}
        >
          Forget learned movements
        </button>
      </p>
      <div className="lab-coordinates">
        Height = 1 · X: Charlie’s left · Y: up · Z: toward you.
        <br />
        Positions are absolute; pelvis offset is relative. Angles are radians.
        Omitted channels hold their targets.
      </div>
      {preview.motion && (
        <div className="lab-fields">
          <label>
            Repeat count
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={preview.motion.repeat ?? 1}
              disabled={lab.running}
              onChange={(event) => {
                if (!Number.isFinite(event.target.valueAsNumber)) return;
                setSource(
                  JSON.stringify(
                    {
                      ...JSON.parse(source),
                      repeat: event.target.valueAsNumber,
                    },
                    null,
                    2,
                  ),
                );
              }}
            />
          </label>
          <label>
            Edit sequence
            <select
              value={section}
              disabled={lab.running}
              onChange={(event) => {
                setSection(event.target.value);
                setPoint(0);
              }}
            >
              <option value="waypoints">Repeated cycle</option>
              {preview.motion.prepare && (
                <option value="prepare">Preparation (once)</option>
              )}
              {preview.motion.finish && (
                <option value="finish">Finish (once)</option>
              )}
            </select>
          </label>
        </div>
      )}
      {editable.length > 0 && (
        <>
          <label className="lab-label">
            Edit waypoint
            <select
              value={Math.min(point, editable.length - 1)}
              disabled={lab.running}
              onChange={(event) => setPoint(Number(event.target.value))}
            >
              {editable.map((p, i) => (
                <option key={i} value={i}>
                  {i + 1} · at {String(p.time ?? "?")}s
                </option>
              ))}
            </select>
          </label>
          <div className="lab-fields">
            {numericFields(selected).map(({ path, value }) => (
              <label key={path.join(".")}>
                {fieldLabel(path)}
                <input
                  key={`${example}:${point}:${value}`}
                  type="number"
                  step={path[0] === "time" ? 0.1 : 0.01}
                  defaultValue={value}
                  disabled={lab.running}
                  onBlur={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber))
                      updateNumber(path, event.target.valueAsNumber);
                    else event.target.value = String(value);
                  }}
                />
              </label>
            ))}
          </div>
        </>
      )}
      <details className="lab-json" open>
        <summary>move_avatar arguments · editable JSON</summary>
        <textarea
          aria-label="Movement arguments JSON"
          value={source}
          spellCheck={false}
          disabled={lab.running}
          onChange={(event) => {
            setSource(event.target.value);
            setSection("waypoints");
            setPoint(0);
          }}
        />
      </details>
      {preview.error ? (
        <p className="error-message" role="alert">
          {preview.error}
        </p>
      ) : (
        <div className="lab-plan">
          <span>
            Requested <strong>{preview.requested!.toFixed(2)}s</strong>
          </span>
          <span>
            Planned <strong>{preview.planned!.toFixed(2)}s</strong>
          </span>
          <p>
            Plan uses the last read pose and current speed limits. Actual
            execution may need up to 3s more to settle.
          </p>
          {preview.segments?.some((segment) => segment.limits.length) && (
            <details className="lab-speed-limits" open>
              <summary>Why a shorter time may not go faster</summary>
              <p>
                The slowest channel sets each segment’s duration. Requesting
                less than its minimum does not increase speed; joint-rate and
                settling limits also apply.
              </p>
              <ol>
                {preview.segments.map((segment, index) => (
                  <li key={index}>
                    Segment {index + 1}: {segment.requestedDuration.toFixed(2)}s
                    requested → {segment.duration.toFixed(2)}s planned.
                    {segment.limits.length > 0 && (
                      <span>
                        {" "}
                        Limited by{" "}
                        {segment.limits
                          .map(
                            (limit) =>
                              `${limit.channel} (${limit.minimumSeconds.toFixed(2)}s minimum)`,
                          )
                          .join(", ")}
                        .
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
      <div className="lab-actions">
        <button
          className="lab-run"
          disabled={!ready || lab.running || !!preview.error}
          onClick={() => lab.run("move_avatar", source)}
        >
          <Play size={14} /> Run movement
        </button>
        <button disabled={!lab.running} onClick={lab.stop}>
          <Square size={14} /> Stop
        </button>
        <button
          disabled={!ready || lab.running}
          onClick={() => lab.run("get_pose", {})}
        >
          Read pose
        </button>
        <button
          disabled={!ready}
          onClick={lab.reset}
          title="Stop movement and restore Charlie’s initial standing pose"
        >
          <RotateCcw size={14} /> Reset pose
        </button>
        <button
          disabled={!ready || lab.running}
          onClick={() => lab.run("capture_avatar", {})}
        >
          Capture avatar
        </button>
      </div>
      <label className="lab-label">
        Mouth opening (preview)
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={lab.mouth}
          disabled={!ready}
          onChange={(event) => lab.setMouth(event.target.valueAsNumber)}
        />
      </label>
      <p className="lab-hint">
        Preview only. During a live call, Charlie’s outgoing audio opens the
        mouth automatically.
      </p>
      <p className="lab-status" role="status">
        {!ready
          ? "Waiting for Charlie to load."
          : lab.running
            ? "Running locally… Stop holds the current pose."
            : result?.error
              ? "Call failed. Edit the arguments and retry."
              : result?.status === "reset"
                ? "Pose reset. Charlie is ready for another test."
                : result?.status
                  ? `${result.status === "interrupted" ? "Interrupted" : "Completed"}${result.constrained ? " · constrained; inspect reasons below" : ""}`
                  : lab.report
                    ? result?.screenshot
                      ? "Fresh avatar image captured."
                      : "Current pose captured."
                    : "Ready. Loading an example does not move Charlie."}
      </p>
      {lab.report && (
        <div className="lab-result">
          {result?.screenshot && (
            <Image
              src={result.screenshot}
              alt="Fresh capture of Charlie’s current pose, without chat or desktop"
              width={result.width || 512}
              height={result.height || 512}
              unoptimized
              className="lab-avatar-capture"
            />
          )}
          <div className="lab-result-heading">
            <strong>Last execution receipt</strong>
            <button
              aria-label="Copy test report"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    JSON.stringify(lab.report, null, 2),
                  );
                  setCopyStatus("Copied");
                } catch {
                  setCopyStatus("Copy unavailable; select the report below.");
                }
              }}
            >
              <Copy size={13} /> Copy report
            </button>
          </div>
          {copyStatus && <p role="status">{copyStatus}</p>}
          {timing && (
            <dl className="lab-metrics">
              <div>
                <dt>Requested / planned</dt>
                <dd>
                  {timing.requestedSeconds.toFixed(2)} /{" "}
                  {timing.plannedSeconds.toFixed(2)}s
                </dd>
              </div>
              <div>
                <dt>Actual execution</dt>
                <dd>{result!.duration?.toFixed(2)}s</dd>
              </div>
              <div>
                <dt>First motion frame</dt>
                <dd>
                  {timing.firstFrameMs === null
                    ? "No frame"
                    : `${timing.firstFrameMs.toFixed(0)}ms`}
                </dd>
              </div>
              <div>
                <dt>Extra settling</dt>
                <dd>{timing.settlingSeconds.toFixed(2)}s</dd>
              </div>
              <div>
                <dt>Frame gaps &gt;50ms</dt>
                <dd>
                  {timing.slowFrames} / {timing.frames}
                </dd>
              </div>
              <div>
                <dt>Largest frame gap</dt>
                <dd>{timing.maxFrameGapMs.toFixed(1)}ms</dd>
              </div>
              <div>
                <dt>Solver mean / peak</dt>
                <dd>
                  {timing.meanApplyMs.toFixed(1)} /{" "}
                  {timing.maxApplyMs.toFixed(1)}ms
                </dd>
              </div>
            </dl>
          )}
          {result?.reasons?.length ? (
            <ul>
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
          <p className="lab-hint">
            First frame measures local scheduling, not visible displacement or
            model latency. Frame gaps include browser load and background tabs.
            Solver time covers applying the pose, not rendering.
          </p>
          <details>
            <summary>Input, starting pose &amp; full result</summary>
            <pre>{JSON.stringify(lab.report, null, 2)}</pre>
          </details>
        </div>
      )}
      <details className="lab-reference">
        <summary>Tool schema &amp; limits</summary>
        <p>
          Use JSON to add any supported channel or up to 16 waypoints. Times
          increase from 0.2 to 20 seconds. Constraints still apply. A completed
          receipt can include a blocked or partially reached target; inspect its
          actual pose and reasons.
        </p>
        <pre>{JSON.stringify(actions, null, 2)}</pre>
      </details>
    </section>
  );
}
