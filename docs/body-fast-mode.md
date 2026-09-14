# Voice and Body speed: earlier Sol trial (issue #36)

**Superseded configuration:** Elias later requested GPT-6 Astra with Fast in the
request. See [the current Astra trial and activation](body-astra.md). The Sol
configuration, measurements and blocked decision below are historical evidence.

Use **Voice** for Charlie’s spoken conversation and **Body** for independent
movement decisions. Voice uses API-backed `gpt-live-1`; Body uses
`openai:gpt-5.6-sol`, low reasoning (`thinking_budget=4000`), through Elias’s
Codex subscription with API fallback disabled. Text chat remains separate.

**Routing during this trial:** Voice 7115, Body 7114, text 7112. Fast request support is
implemented on isolated 7116, but its first real response reported `default`,
so the app was not switched. Issue #36 remains open for verified Fast delivery.

Elias confirmed the real Voice trial works after the setup fix. His requested
wave was acknowledged promptly and later executed, but the planning delay felt
long. After PR #37 landed, its timing view read the original saved browser trace:
**901 ms speech wait**, **12.3 seconds planning**, **22 ms start delay**, and
**5.0 seconds movement**. Three earlier Body decisions display as canceled,
with no completed planning or movement metric. This inspection only reloaded
the saved conversation; it did not allocate a call or run another model.

An earlier read compared the runtime's user and model-response timestamps:
**4.739 seconds** apart. Those message timestamps are not a complete request
stopwatch and must not be described as full planning duration. The browser's
12.3-second interval runs from planning admission through the complete tool
response; it includes generation and request/transport overhead. Do not assign
the difference to a particular network or runtime stage without evidence.

The engine receipt independently reports **18 ms** to its first frame and
**4.981 seconds** for the wave (requested 4.0 seconds, solver plan 4.969). Its
18 ms starts at engine admission, a narrower interval than the browser's 22 ms
from tool return. That receipt is on Body 7114, session
`d29a028b-00d6-43ea-9fd0-ce61cd25b1a0`, on September 14, 2026 at 18:31 UTC.
Earlier 14.6-second evidence was an eight-cycle run, not this wave.

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

App [PR #37](https://github.com/eandualem/avatar-studio/pull/37) merged as
`80ac3e475a09d242bd49e2b1215292da5f334851`, delivering naming and timing feedback.
The continuing app checkout was fast-forwarded to main and the delivered UI
was checked against Elias’s saved real trial on 7140. The runtime peer reviewed the
measurement boundaries and cancellation/unknown-value handling without blockers.
All 100 tests, TypeScript, lint, production build and desktop/mobile checks pass.
GitHub's application job could not start because account billing/spending limits
blocked it; matching checks pass locally and main has no required branch gates.

At the end of this Sol trial, verified Fast activation and a demonstrated Body
speedup remained unfinished, so issue #36 stayed open and routing retained Body
7114, Voice 7115 and text 7112. The next step then was an explanation of the
returned standard tier. Elias subsequently requested Astra with Fast enabled in
the request and further trials; [the Astra handoff](body-astra.md) owns the
current direction and activation. Never label configured Fast as delivered Fast.
