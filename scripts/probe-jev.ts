/**
 * Sends the exact questions the expression loop asks to Jev for a few
 * transcript lines and prints what it would decide, with latency. Tune the
 * question wording in lib/expression-controller.ts from what you see here.
 *
 *   make probe-jev
 *   make probe-jev LINES="'can you clap?' 'hahaha'"
 */
import { readFileSync } from "node:fs";
import { expressionQuestions } from "../lib/expression-controller";
import { libraryDigest, seedGestures } from "../lib/gesture-library";
import { jevResponseSchema } from "../types/jev";

const env = (() => {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => l.split("=", 2) as [string, string]),
    );
  } catch {
    return {};
  }
})();
const key = process.env.TYPESAFE_API_KEY || env.TYPESAFE_API_KEY;
if (!key) {
  console.error("TYPESAFE_API_KEY is not set (.env.local).");
  process.exit(1);
}
const lines = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "hey Charlie! good to see you",
      "can you clap for me?",
      "okay okay stop",
      "what is the capital of France?",
      "hahaha that's so good",
      "do a cartwheel!",
      "can you wave with both hands?",
      "wave with your right hand",
      "nod",
      "go back to your natural position",
      "so basically the way it works is that the model decides",
      "hmm, I'm not sure that's right",
    ];
const questions = expressionQuestions(seedGestures);
const rows: Record<string, string | number>[] = [];
for (const text of lines) {
  const state = {
    conversation: [
      { speaker: "charlie", text: "Hi, I'm Charlie. What shall we do today?" },
      { speaker: "user", text, transcript: "complete" },
    ],
    charlie: {
      library: libraryDigest(seedGestures),
      speaking_now: false,
      silence_seconds: 0,
      body: "standing at rest",
      holding_still: false,
      performed_for_latest_user_line: [],
    },
  };
  const started = performance.now();
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || env.JEV_MODEL || "jev-latest",
      state,
      questions,
    }),
  });
  const ms = Math.round(performance.now() - started);
  const json = await response.json();
  if (!response.ok) {
    rows.push({ line: text, ms, error: JSON.stringify(json).slice(0, 120) });
    continue;
  }
  const a = jevResponseSchema.parse(json).answers;
  const gesture = a.gesture.type === "choice" ? a.gesture : undefined;
  const top = gesture
    ? Object.entries(gesture.probabilities)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 2)
        .map(([k, v]) => `${k} ${v.toFixed(2)}`)
        .join(", ")
    : "";
  rows.push({
    line: text,
    ms,
    intent:
      a.intent.type === "choice"
        ? `${a.intent.choice} ${a.intent.confidence.toFixed(2)}`
        : "",
    start: a.start.type === "noul" ? a.start.noul.toFixed(2) : "",
    stop: a.stop.type === "noul" ? a.stop.noul.toFixed(2) : "",
    covered: a.covered.type === "noul" ? a.covered.noul.toFixed(2) : "",
    gesture: top,
    energy: a.energy.type === "score" ? a.energy.score.toFixed(1) : "",
    sustain: a.sustain.type === "score" ? a.sustain.score.toFixed(1) : "",
    body_language:
      a.body_language.type === "choice"
        ? `${a.body_language.choice} ${(a.body_language.probabilities[a.body_language.choice] ?? 0).toFixed(2)}`
        : "",
  });
}
console.table(rows);
