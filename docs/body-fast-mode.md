# Voice and Body speed (issue #36)

Use **Voice** for Charlie’s spoken conversation and **Body** for independent
movement decisions. Voice uses API-backed `gpt-live-1`; Body uses
`openai:gpt-5.6-sol`, low reasoning (`thinking_budget=4000`), through Elias’s
Codex subscription with API fallback disabled. Text chat remains separate.

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
This tradeoff was explained before activation. It does not promise 2–3× faster
end-to-end movement, and it does not change animation speed limits.

Body uses a direct subscription transport in assistant-runtime, so the coding
agent’s `/fast` setting does not configure it. Runtime issue
[#126](https://github.com/eandualem/assistant-runtime/issues/126) adds the isolated
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

The app passes 100 tests, type checking and lint. Browser verification used the
existing synthetic Voice fixture: a hold and an eight-cycle run displayed
separate Voice status and Body timings, which remained after hangup. Desktop and
390×844 mobile checks passed without horizontal overflow. No real microphone or
Live provider session was used. The temporary fixture route is removed from the
production build. The preview needs the existing `WATCHPACK_POLLING=true` setting
on this machine; a non-polling preview exhausted file watchers and was replaced.
