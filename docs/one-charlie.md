# One Charlie: voice/body coherence and movement start (issue #48)

Handoff for the session that starts on September 16, 2026. Nothing in this
document has been implemented; Elias reviewed the analysis and the plan on the
evening of September 15 and asked to continue the next day.

## Where things stand

- One assistant-runtime on 7100 (`make runtime`, checkout `8019c99`) serves
  text, voice and body. The app is `make dev` on 7140. See
  [single runtime](single-runtime.md).
- The Body model control in the conversation header selects the planner per
  browser; Cerebras `gpt-oss-120b` and `qwen-3.8-27b` work. Elias's real call
  used gpt-oss-120b and it animated. See [body model selection](body-model-selection.md).
- Elias's decisions: keep the Body prompt as it is (it helps the small model);
  do not change the 0.9 s quiet period now; movement duration is not a concern,
  only the moment movement starts; the Live voice must sound like one Charlie.

## What the last call showed

[Issue #48](https://github.com/eandualem/avatar-studio/issues/48) carries the
full table, transcript excerpts and diagnosis. In short:

- Last word to first movement frame was 3.2–6.4 s; planning is 60–85 % of it
  (2.3–5.5 s on gpt-oss-120b), the fixed quiet period the rest. Transcription
  and Voice's reply are each under half a second and not part of the problem.
- A sentence spoken with pauses arrived as seven fragments; each cancelled the
  decision in flight, so no movement ran for thirty seconds.
- Voice narrates its own rules ("I'll need confirmation before saying anything
  started") and announces completions ("And there we go"). The facts already
  reach Live on the silent `session.thinking.append` channel, so this is the
  prompt, not the transport.
- GPT-Live controls turn-taking itself; no VAD or eagerness setting applies.
  Backchannels are prompt-controlled and OpenAI recommends keeping them
  moderate, so the fix for split sentences is in the app's admission logic.

## Plan for tomorrow (order agreed)

1. Rewrite `profiles/live-instructions.md` in positive, in-character terms
   (issue #48 item A). The runtime reads the file at startup through
   `VOICE__CONVERSATION_INSTRUCTIONS_FILE`, so a prompt change needs a
   runtime restart; check `/api/voice/status` shows zero active calls first.
   (Since issue #53 the app sends the file's text per call, so a prompt change
   only needs a new call.)
2. Continuation-aware admission in `lib/body-controller.ts` (item B): merge
   fragments across short backchannels, keep the in-flight decision, decide on
   the combined text; unit tests from the seven-fragment sequence.
3. Verify facts stay silent with the new prompt (item C), then look at the two
   round trips per gpt-oss decision (item D) and add the last-word-to-first-frame
   measurement (item E).
4. Elias runs a real call and compares Qwen vs gpt-oss before choosing the
   default Body model.

## Evidence files (untracked, in `.tmp/`)

- `call-eb56a4f8-transcript.json`: the runtime's call record with transcript
  fragments and `start_ms`/`end_ms` (fetched while 7100 was still up; the
  in-memory record disappears on restart).
- `gptoss-call-session.json`: the earlier gpt-oss Body session with the engine
  receipt and `usage.requests = 2`.
- `model-comparison-2026-09-15.json`, `cerebras-activation-2026-09-15.json`:
  offline and live-port planning times per model.
- The Body trace Elias pasted from **Copy Body details** is quoted in issue #48;
  it lives in his browser's saved conversation.
