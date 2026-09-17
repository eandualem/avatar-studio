# Expression: Jev, the library and the planner

On this branch Charlie's body during a live call is driven by a decision
model, not by a planner writing numbers for each utterance. This page is
the loop; [motion.md](motion.md) is still the solver and the tool.

## The idea

[Jev](https://docs.typesafe.ai/introduction) is TypeSafe AI's System One
model: it answers typed questions about a state in one forward pass, 70 to
500 ms, with calibrated probabilities. It cannot write a waypoint. It can
read a half-spoken sentence and say whether Charlie should start something,
what from a list, how much energy, and whether the user wants him to stop.

So the movements are authored once, as ordinary `move_avatar` plans in
`lib/gesture-library.ts`, and Jev chooses among them on every transcript
change. A movement the library lacks goes to the planner as before, and its
plan joins the library for next time.

## The loop

`lib/expression-controller.ts` owns it. Every transcript fragment, from the
user or from Charlie's own speech, calls `observe`:

1. Fragments become lines per speaker (`lib/expression-lines.ts`). A user
   line keeps its identity while it grows, so what was performed for it is
   remembered.
2. One Jev call carries the state and five questions. At most one call is in
   flight; a burst of fragments coalesces into the next call with the latest
   lines. Identical state is never sent twice.
3. After 800 ms without a new fragment the last line counts as complete and
   is asked once more, because a moderately confident start on a partial
   line waits for the complete one.
4. Code acts on the answers. Only the controller moves Charlie during a call.

The state Jev reads:

```json
{
  "conversation": [
    { "speaker": "charlie", "text": "Hi, I'm Charlie." },
    { "speaker": "user", "text": "can you clap", "transcript": "partial, still speaking" }
  ],
  "charlie": {
    "library": ["wave: Raise the left hand beside the head and wave it; one hand only", "clap: …"],
    "speaking_now": false,
    "body": "idle, standing",
    "holding_still": false,
    "performed_for_latest_user_line": []
  }
}
```

The six questions, all in one call (`expressionQuestions`):

| Key | Type | Asks |
|---|---|---|
| `intent` | choice | explicit request, incidental, or none, for the latest user line |
| `start` | noul | start a new gesture now, given what the body is already doing |
| `gesture` | choice | which library entry, or `not_in_library` |
| `covered` | noul | does an entry perform exactly what was asked, hands and side included |
| `stop` | noul | does the latest user line ask the body to stop |
| `energy` | score | still, calm, lively, playful |

`covered` is the branch that grows the library. Jev always names the
nearest entry, so "wave with both hands" scores the one-hand wave at 0.65;
asked separately whether the library covers the request, it answers 0.04.
Probed values: clap 0.93, nod 0.91, cartwheel 0.03, right-hand wave 0.04.

Every criterion carries examples. Without them Jev was indecisive on "stop"
and on greetings; with them it is not. Tune the wording from
`make probe-jev`, which sends these exact questions for sample lines and
prints the answers and latency.

## What code decides

Thresholds live in `ExpressionController` and are the whole policy:

- **Stop** at `stop ≥ 0.85`, from a user line only. The body holds still until
  an explicit request.
- **Start** at `start ≥ 0.6` on a complete line. While the line is still
  being spoken an explicit request starts at `≥ 0.7` and an incidental
  gesture at `≥ 0.8`; in a real call explicit lines scored 0.75 to 0.92
  while partial and non-requests stayed under 0.5.
- **Explicit** when `intent` is `explicit` with confidence `≥ 0.6`. The
  intent is about the latest user line even once Charlie has started
  replying, so a request that was just under the bar while spoken is still
  served, as explicit, when his reply arrives. Explicit actions clear
  stillness, replace anything, and are reported to Live as facts. Incidental
  ones never interrupt an explicit action, never run while holding still,
  and are not repeated within 6 s.
- **Not covered** (`covered < 0.5`) with an explicit intent asks the planner,
  even when `gesture` names a nearest entry.
- **A plan composing survives new lines.** A correction ("no, I said both
  hands") or a repeat waits for the plan already in flight instead of
  restarting it; in a real call restarting cost three planner runs for one
  request. Only a stop, a snapshot, or an explicit request the library can
  serve cancels a plan.
- **Once per line.** A gesture performed for the current user line is not
  performed again for it; the state tells Jev so, and code enforces it.
- **Not in library** with an explicit intent asks the planner once per line.
  Incidental "nothing fits" does nothing.

Energy shapes the chosen entry (`shapeGesture`): tempo from 1.2× slower to
0.8× faster, and cycles scaled for rhythmic entries, so a clap for a joke is
quicker and longer than a polite one.

## The library

`seedGestures` is fifteen entries: wave, clap, nod, shake_head, shrug,
thinking, lean_in, celebrate, run_in_place, look_left, look_right,
point_forward, bow, laugh and rest. Each has a `what` and `examples` that
become Jev's criteria, and a `motion` that is a valid `move_avatar` plan.
`tests/gesture-library.test.ts` runs every entry on the shipped skeleton and
fails on any collision, floor penetration or blocked target. The Dev panel
lists them as "Library · name" for tuning by eye.

Learned entries are added by the planner path: when Jev says
`not_in_library` and the intent is explicit, the planner receives the usual
body request, its `move_avatar` plan runs, and a completed run is stored
under a name derived from the plan's label, with the user's line as its
example. Learned entries live in this browser's local storage
(`avatar-studio.gesture-library`, last 40) and are offered to Jev from the
next call on. Nothing is stored server-side.

## Reading a call afterwards

Every Jev round trip is one line in the browser console, prefixed
`[expression]`: call number, time into the call, latency, the line Jev saw
(`…` while still being spoken), its answers, and what the controller did
with them, including why it did nothing. The same rows are in **Body
timing → Jev decisions** during and after the call and in **Copy Body
details**, so a report can quote them. The runtime keeps no record of Jev
calls; the planner's own sessions remain readable at the runtime's
`/api/sessions` as before.

## Latency

Jev answered in 330 to 520 ms in probes, about 1 s on the first call of a
session. The transcript itself arrives as the provider produces it, so a
gesture can start while the user is still talking. There is no quiet period
any more; the settle re-ask is a second chance, not a wait.

## What it does not do

- Jev never composes motion. Fine, continuous body control is not a
  decision task; the library and the planner own the numbers.
- Rhythm lives in the library entries. Jev decides to start and to stop.
- Facial expression is unchanged: the mouth follows audio amplitude.
- The key is server-side (`TYPESAFE_API_KEY` in `.env.local`, used only by
  `app/api/jev/route.ts`). Without it a call still connects, but the body
  stays idle and the Jev line under the call status says why.
