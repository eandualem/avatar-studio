# GPT-6 Astra for Body (issue #36)

Elias explicitly requested GPT-6 plus Fast in the request after the Sol trial.
That supersedes the earlier decision to keep the Body model fixed and wait for
provider-confirmed Fast before routing the app. The requested configuration is
`openai:gpt-6-astra`, low reasoning (`thinking_budget=4000`), and
`LLM__CODEX_SERVICE_TIER=fast` through his Codex subscription. The runtime maps
Fast to outbound `service_tier=priority` and reports the actual returned tier
separately. A returned standard tier must remain visible in the evidence; it
is not grounds to silently undo Elias's requested configuration.

The [official Astra migration guide](https://developers.openai.com/api/docs/guides/latest-model)
specifies Responses for tool calling, supports low reasoning, and excludes
sampling parameters such as temperature and top-p. Body already uses Responses
and the subscription adapter omits those parameters. Runtime [issue #129](https://github.com/eandualem/assistant-runtime/issues/129)
addresses a compatibility check that found effort mapping recognized GPT-5 only; Astra must be recognized
before activation so the 4000 budget actually sends `reasoning.effort=low`.
Prompts, procedural tools, transcript scheduling and animation limits are fixed
for this trial. Voice remains `gpt-live-1` on API access; typed text retains Sol.

The account's cached Codex catalog advertises Astra's Fast tier as `priority`.
Catalog availability is not proof of either model execution or delivered Fast.
The [official Codex speed page](https://learn.chatgpt.com/docs/agent-configuration/speed)
states Astra Fast uses 2.5 times Standard credits where available. Do not apply
the earlier GPT-5.6 speed multiplier to Astra or promise a fixed end-to-end gain.

## Verification method

Use one offline Astra decision with the exact saved standing-pose wave payload
from the Sol comparison, validate it using `bodyDecision`, and close its pending
tool with one failed non-executed receipt. Then use the existing synthetic Voice
fixture with an explicit wave button and real subscription Body enabled to
verify the second Astra decision on the actual renderer. Both use the request:
“Please give a brief wave with your right hand, then return to the initial pose.”
The browser trial includes its normal history and measured pose, so it is an
integration check, not an identical repeated benchmark. No real microphone or
paid Live call is allocated. Do not retry model calls to obtain a faster result.

Record full request timing, provider model and requested/actual tier, engine
start/end and final receipts. Compare cautiously with the earlier Sol wave:
11.497 seconds for the same offline payload and 12.3 seconds of planning in the
saved real Voice trial. These small, separate samples are not a controlled
speed estimate and cannot attribute a change to model versus service tier.

## Runtime delivery

Runtime [PR #130](https://github.com/eandualem/assistant-runtime/pull/130) merged
as `5f2161b1585537b55a8aee1b34ca63439e843b1e`. All 2,390 offline tests, Ruff and
four GitHub Python/SDK compatibility jobs pass. Independent runtime review and
the app's bounded contract review found no blocker. CodeRabbit returned a
rate-limit notice rather than a review; no required optional-review gate applied.
HTTP-boundary tests inspect the real SDK payload with a mocked provider: Astra,
low effort, priority, movement tool schema and no unsupported sampling/log-probability
fields. Host receipts finish without another model call.

## Activation and results

The app now routes **Body to 7117**, with **Voice on 7115** and **text on 7112**.
Isolated runtime 7117 is PID **74661**, from
`/tmp/assistant-runtime-astra-body` at merged `5f2161b`; private startup state,
settings and readiness notes are in `/tmp/avatar-codex-7117`. Codex sign-in is
connected and the live settings API confirms Astra with a 4000 thinking budget.
Health reports `components.llm_service.codex_only=true` and requested tier
`fast`. The subagent default remains Sol/4000; summary and working-memory
defaults remain Luna, with working memory off. These auxiliary routes are not
used by the one-decision Body workflow. API fallback remains disabled.

Only two Astra model decisions were used:

- **Offline: 6.814 seconds**, session
  `2ac98c7f-c380-4cac-a67a-aea17bd85708`, 7,270 input and 217 output tokens.
  Returned `move_avatar` passed the app validator; the non-executed final receipt
  was confirmed. Provider response
  `resp_0b79330b1f26f474016aa84caad2f487d1b4f589b7a45894db` reports
  `gpt-6-astra`, requested `priority`, actual **`default`**.
- **Browser: 7.3 seconds planning**, session
  `a70dd4fc-9be2-40e8-8699-92072a2615e3`, 7,439 input and 226 output tokens.
  The UI recorded 902 ms speech wait, 30 ms from tool return to movement, and
  4.8 seconds of motion. The engine receipt confirms completion in **4.872
  seconds**, one cycle, and return to standing; its narrower admission-to-first-
  frame interval was 4.3 ms. Wrist and speed limits applied, with one slow frame
  (76.9 ms maximum gap). Provider response
  `resp_021de347b066e11d016aa84ce7efd887d186db58fccccfee5f` also reports
  `gpt-6-astra`, requested `priority`, actual **`default`**. The saved runtime
  message contains the completed engine receipt, with one model request total.

Both samples were quicker than the earlier Sol samples, but this does not
establish a repeatable multiplier or a Fast-tier benefit. Astra generated fewer
output tokens; provider load and other uncontrolled factors may also matter.
**Fast is enabled in requests; these two responses were served as standard.**
Elias explicitly requested this configuration for his own trial, so it remains
active with that distinction documented. No additional model retry was made.

The renderer completed the wave and its final standing pose was visually
inspected. Timing feedback remained after synthetic hangup. The temporary
preview route was removed after verification; no fixture goes into production.
App implementation is unchanged from the prior 100-test/type/lint/build and
mobile/desktop validation. This change modifies deployment configuration and
handoff documentation; `git diff --check` passes. GitHub application checks may
remain unavailable because of the recorded account-billing restriction.

Voice 7115 reported zero real active calls before switching the Body URL. The
previous app configuration is backed up in `.tmp/pre-body-astra.env.local`.
An unknown-session cancellation through the app proxy returned normally without
allocating a model request. Every old runtime and history is retained, including
Sol instances 7114 and 7116. Do not edit active runtime source or replace old
processes. Raw evidence stays in `.tmp/astra-body-benchmark-results.json` and
`.tmp/astra-browser-messages.json` in the continuing app checkout.

Body starts a fresh runtime session for each admitted utterance, so old backend
sessions do not need migration. App [PR #39](https://github.com/eandualem/avatar-studio/pull/39)
merged as `25a57beeee7e01c0deb3c4ad9bbf18faf8ebedab`, and issue #36 is closed.
The request setting, model and trial evidence fulfill its revised scope;
provider-tier selection remains an observed limitation, not proof that Fast
processing was delivered.

## Acceptance and next-session work

On September 14, 2026, Elias confirmed the real call worked well, called its
speed reasonable and consistent with the trial estimate, and accepted the
architecture as a significant improvement. This closes the earlier user-run
Voice acceptance step. The acceptance is qualitative: no new agent-run model,
microphone or provider trial was needed for this handoff, and the two recorded
Astra responses above still report standard service.

Elias also reported that Voice still appears to wait a little for the movement,
so speech and motion do not feel simultaneous. Preserve that as an unresolved
experience gap, not a claim that the two paths are serial or that a particular
component is proven to block Voice. The app schedules Voice and Body independently,
but completion of a Body decision and relevant spoken words need not coincide.
No new timing trace from this final user trial was analyzed to apportion the gap.

Future optimization direction, when Elias resumes implementation:

1. Measure the perceived speech/motion gap with full host timings: transcript
   readiness, Body request/complete return, first movement frame, audible Voice
   onset and engine-context acknowledgment. Identify whether the next improvement
   concerns planning delay, spoken phrasing or alignment. Server message creation
   timestamps are not a complete planning stopwatch.
2. Examine Body tool-call latency, prompt/context size, generated argument length
   and the utterance-admission quiet period using bounded comparable trials.
   These are candidate investigations, not measured bottlenecks or approved
   protocol changes. Keep procedural flexibility, explicit-command priority,
   cancellation, exactly-once execution and final receipt semantics. Voice's
   movement claims must continue to use engine facts.
3. Revisit substantially faster provider generation when documented and available
   to the intended account/model/billing path. Do not change the accepted model,
   requested tier or subscription policy during this documentation handoff.

### Ultrafast research lead

Elias recalled a limited-client offering faster than ordinary Fast mode, perhaps
5–6 times normal generation speed. On this handoff date, the official
[Responses request reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
documents a separate access-controlled `ultrafast` service tier, currently for
`gpt-5.6-sol`; an actually served response reports `service_tier=ultrafast`.
This is a plausible match to the offering he meant, not a confirmed identification.
The consulted reference does not establish the recalled speed multiplier, an
availability date, this account's eligibility, Codex subscription support, or
Astra availability. Recheck those facts before proposing a future trial.

### Delivery and continuing state

App delivery PRs #33, #35, #37, #38 and #39 are merged; the associated implementation
issues are closed. The application had no open PRs or issues at the acceptance
check. Superseded PR #31 is closed without merge, and `fix/live-action-dispatch`
is deliberately preserved per the earlier handoff. Do not merge that experiment.
Runtime dependencies and source commits are recorded in this document and the
linked earlier notes; assistant-runtime owns its own shared deployment handoff.

The acceptance update changes documentation only. The accepted app, models,
runtime routes and processes remain intact. Main is the continuing application
base; remove only this documentation task's branch/worktree after merge and
prune its stale references. Preserve active runtime source checkouts and all
in-memory histories. No performance work, provider experiment or polling loop
is left running for the next session.
