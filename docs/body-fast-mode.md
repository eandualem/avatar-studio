# Voice and Body speed (issue #36)

Use **Voice** for Charlie’s spoken conversation and **Body** for independent
movement decisions. Voice uses API-backed `gpt-live-1`; Body uses
`openai:gpt-5.6-sol`, low reasoning (`thinking_budget=4000`), through Elias’s
Codex subscription with API fallback disabled. Text chat remains separate.

**Current routing:** Voice 7115, Body 7114, text 7112. Fast request support is
implemented on isolated 7116, but its first real response reported `default`,
so the app was not switched. Issue #36 remains open for verified Fast delivery.

Elias confirmed the real Voice trial works after the setup fix. His requested
wave was acknowledged promptly and later executed, but the planning delay felt
long. The runtime’s recorded acceptance and model-response timestamps are about
**4.739 seconds** apart. The engine receipt reports **18 ms** to its first frame
and **4.981 seconds** for the wave (requested 4.0 seconds, solver plan 4.969).
That receipt is on Body 7114, session `d29a028b-00d6-43ea-9fd0-ce61cd25b1a0`,
on September 14, 2026 at 18:31 UTC. These server timestamps do not measure speech
recognition or the app’s 900 ms quiet period. Earlier 14.6-second evidence was an
eight-cycle run, not this wave.

## Fast mode contract

Elias requested Fast mode for Body. The [official Codex speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed)
describes roughly 1.5× model speed at 2.5× subscription credit usage for GPT-5.6.
This tradeoff was explained before the trial; activation remains blocked. It does not promise 2–3× faster
end-to-end movement, and it does not change animation speed limits.

Body uses a direct subscription transport in assistant-runtime, so the coding
agent’s `/fast` setting does not configure it. Runtime
[PR #127](https://github.com/eandualem/assistant-runtime/pull/127) implements the isolated
startup setting `LLM__CODEX_SERVICE_TIER=fast`, mapped to outbound
`service_tier=priority` only on Codex-authenticated requests. Model, reasoning,
prompts and procedural tools remain the same. Preserve all existing runtime
instances and histories; activate Body separately from Voice.

Health reports the configured request policy. Chat results may also contain
`usage.service_tiers`, with `provider_response_id`, `model`, `requested`, and
`actual` per model response. A missing actual tier means unknown, never proof
of Fast delivery. This separates configured intent from provider evidence.

## Timing feedback

The app labels conversation as Voice and movement work as Body. **Body timing**
shows the latest eight recorded decisions during or after a call: speech wait
from the latest transcript update to the planning request, planning through
receipt of the complete tool decision, start delay through the first engine
frame, and movement duration. Planning includes runtime/network overhead.
Canceled decisions without a model return and holds without a movement show
missing metrics, not zero latency or a successful motion. **Copy Body details**
retains the complete existing trace for deeper inspection.

The app passes 100 tests, type checking, lint and the production build. Browser verification used the
existing synthetic Voice fixture: a hold and an eight-cycle run displayed
separate Voice status and Body timings, which remained after hangup. Desktop and
390×844 mobile checks passed without horizontal overflow. No real microphone or
Live provider session was used. The temporary fixture route is removed from the
production build. The preview needs the existing `WATCHPACK_POLLING=true` setting
on this machine; a non-polling preview exhausted file watchers and was replaced.

## Bounded subscription comparison

Use the same standing-pose host context, movement tools and instruction in fresh
sessions: “Please give a brief wave with your right hand, then return to the
initial pose.” The planned limit was two decisions per configuration, interleaved baseline,
Fast, Fast, baseline; the run stopped after the first pair because the requested
Fast tier was not delivered. Keep model, reasoning, prompts and tool schema fixed. This is a
small operational check, not a statistical speed estimate: provider load, prompt
caching and generated waypoint length can differ between requests.

Measure the `/api/chat` round trip through the complete tool decision. Validate
with the application's `bodyDecision`, then close each pending tool with one
failed, non-executed receipt identifying the offline comparison. No animation,
Voice allocation or follow-up model turn is needed. Check provider-returned
`usage.service_tiers` on Fast results; configuration alone is insufficient.
The preserved baseline runtime predates this telemetry, so its actual service
tier is unobserved even though it has no Fast setting.

### Recorded result: Fast not delivered

The run began at `2026-09-14T19:06:24.629Z`. Both requests returned one validated
`move_avatar`; both pending tools were closed with confirmed non-executed
receipts. No movement or real Voice call ran. Only two of the planned four
model calls were made; no retry or alternate model was substituted.

- Preserved baseline 7114: **11.497 seconds**, session
  `11defcb4-ce5b-486e-aba0-d0b09a91f94a`; actual service tier unobserved.
- Fast-configured 7116: **46.969 seconds**, session
  `d84dd880-6979-46f2-84f7-f2f5e440ad12`; requested `priority`, actual **`default`**.
  Provider response `resp_0308362cbbe0e211016aa845bee61087d18e1d564b86e7cdf3`,
  model `gpt-5.6-sol`, 7,270 input and 431 output tokens, one model request.

This pair does not estimate Fast performance: the provider did not report Fast
processing. The slower second result does not establish that requesting Fast
caused the delay. The payload's serialized SHA-256 is
`d156541f83bce69b22200228ba28c3c5ce1e09a59900b08e45b05ba332cd5551`.
The payload, script and results are retained in the app's ignored `.tmp/` folder.
Runtime `cost_usd` is a token-price estimate, not measured subscription billing.

The local Codex model catalog advertises `priority` as Sol's Fast tier. OpenAI's
[Codex source](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/config_types.rs)
uses that same request value. A [firsthand Codex issue](https://github.com/openai/codex/issues/32191)
reports a similar requested-priority/returned-default mismatch for Sol in
non-interactive use; it is not a provider-confirmed explanation of this trial.
Account eligibility, provider load and backend policy are not established by
this result. Do not guess a root cause or repeatedly consume credits testing it.

### Runtime delivery and app handoff

Runtime PR #127 merged as `2c9672f7296459b9507b9916dc134d768a4caf80`.
Its 2,384 tests, lint/format and all four GitHub CI variants passed, and independent
review was clear. CodeRabbit remained processing at merge; the runtime repo had
no required gate for that optional review. Read later feedback before new work.

Isolated **7116**, PID **47385**, runs from
`/tmp/assistant-runtime-codex-fast`; private state and launcher are in
`/tmp/avatar-codex-7116`. Health confirms
`components.llm_service.codex_service_tier = "fast"` and subscription-only Sol;
that is the requested policy, not proof of Fast processing. Subscription sign-in
is connected. The settings and Body/Voice profiles match 7114, including low
reasoning (4000 budget). The peer and app agent made no paid Voice calls.
Preserve 7116 for evidence, alongside every previous runtime and its histories.

App PR #37 delivers naming and timing feedback. The runtime peer reviewed the
measurement boundaries and cancellation/unknown-value handling without blockers.
All 100 tests, TypeScript, lint, production build and desktop/mobile checks pass.
GitHub's application job could not start because account billing/spending limits
blocked it; matching checks pass locally and main has no required branch gates.

**Unfinished:** verified Fast activation and a demonstrated Body speedup. Issue
#36 stays open. Root `.env.local` and `.env.example` retain Body 7114, Voice 7115
and text 7112. Refresh the app to see timing feedback; no new Voice session was
allocated to deliver it. The next step is a supported explanation or remedy for
the returned standard tier before any further bounded subscription test. Do not
silently change the model, use API billing, spoof client headers, or label
configured Fast as delivered Fast.
