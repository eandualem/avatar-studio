# Body model selection (issue #44)

Charlie's movement planner is a single tool-only decision per user utterance
(see `docs/parallel-body-control.md`). On the accepted September 14 setup that
decision runs on GPT-6 Astra and takes about 9–10 s for a ~200-token plan:
Astra generates roughly 50 tokens/s with ~2.7 s to first token, and requested
Codex Fast was never delivered in any recorded response. Movement planning is
not a frontier-model task, so the app now lets Elias pick the Body model in the
conversation header and compare planning times in the existing Body timing panel.

## How it works

- The **Body model** control in the conversation header offers curated
  candidates and an “Other…” field for any `provider:model` id. The choice is
  stored in this browser only (`localStorage`, key `avatar-studio.body-model`).
- Each Body decision sends the choice as `config.default_model`. With “Runtime
  default” selected the server proxy fills in `BODY_MODEL` (default
  `openai:gpt-6-astra`) and `BODY_THINKING_BUDGET`.
- Text and voice are unaffected. Only movement planning changes model.
- A model the runtime cannot route fails the decision with the runtime's error
  (today: “Subscription-only routing requires an openai: model” for any
  non-OpenAI id). The controller holds; Voice keeps talking.

## Candidates and published speeds

| Model | Output speed | First token | Notes |
| --- | --- | --- | --- |
| `cerebras:gpt-oss-120b` | ~1,700–3,000 t/s | ~1.6 s | Production model, tool calling, $0.35/$0.75 per 1M in/out |
| `cerebras:qwen-3.8-27b` | ~1,850 t/s | n/a | Newer; strict tool schemas may not use `pattern`/`minLength`/`maxLength` |
| `google:gemini-3.8-flash` | ~300 t/s | thinks first | Needs `GOOGLE_API_KEY` |
| `openrouter:x-ai/grok-4.1-fast` | ~120 t/s | ~0.2–0.5 s | Needs `OPENROUTER_API_KEY`; `:nitro` picks fastest host |
| `openai:gpt-5.6-luna` / `sol` | — | — | Codex subscription; Sol measured 11–12 s earlier |
| `openai:gpt-6-astra` | ~51 t/s | ~2.7 s | Accepted default; 6.8–9.9 s measured |

Published figures come from provider docs and Artificial Analysis on
September 15, 2026; they are not measurements of this workload.

## Cerebras account facts

Public shared tier: `gpt-oss-120b` and `qwen-3.8-27b` only. Both support tool
calling with `tool_choice`, strict schemas and parallel calls. Free trial: 5
requests/min, 1M tokens/day, 64–65k context. Developer (first purchase): 1,000
requests/min for gpt-oss-120b, 300 for qwen, no daily cap, 128–131k context.
Gemma 4 31B, Kimi K2.7 Code, Llama, Mistral and DeepSeek are dedicated-endpoint
or trial-only. The key belongs in the runtime's `.env` as `CEREBRAS_API_KEY`.

## Runtime prerequisites

The runtime's model library already includes a Cerebras provider, but the
runtime allows only `anthropic`, `openai`, `google` and `openrouter`, and the
`LLM__CODEX_ONLY` guard rejects every non-OpenAI model. Requested changes,
tracked with [assistant-runtime #131](https://github.com/eandualem/assistant-runtime/issues/131):
add `cerebras` (and ideally `groq`) to the provider list and catalog, and allow
an explicitly allowlisted per-request model to bypass Codex-only routing so Body
can use an API provider while text and voice stay on the subscription and
GPT-Live.

## Measured on September 15, 2026 (runtime PR #138, scratch port)

Same saved standing-pose wave request, one decision per row, movement not
executed (failed receipt), validated with the app's `bodyDecision`:

| Model | Planning time | Result | Output tokens |
| --- | --- | --- | --- |
| `cerebras:qwen-3.8-27b` | 2.1 s, 2.5 s, 2.6 s, 3.9 s | valid `move_avatar` every time | 1,264–1,861 (includes reasoning) |
| `cerebras:gpt-oss-120b` | 3.0 s, 3.6 s, 3.6 s | `hold` every time (no movement for a wave request) | 322–369 |
| `openai:gpt-6-astra` | 10.4 s, 11.3 s | valid `move_avatar` | 216–219 |
| `openai:gpt-6-astra` + Fast requested | 7.5 s | valid; requested `priority`, served `default` | 219 |

Raw rows: `.tmp/model-comparison-2026-09-15.json`; script:
`.tmp/benchmark-body-models.mjs`. These are single local samples, not a
controlled benchmark. Qwen is the working fast candidate; gpt-oss-120b needs
prompt work before it is useful for movement, and Astra's requested Fast tier
was again not delivered.

Two schema facts surfaced and are fixed in their proper places:

- Cerebras strict tool schemas reject `minLength`/`maxLength` on strings. The
  app's `label` field no longer declares them; the app still enforces 1–80
  characters when validating the call.
- Cerebras rejects a request whose tools mix `strict` values. The model library
  marks a tool strict only when its schema is strict-compatible, so host tools
  with numeric ranges are non-strict while the runtime's own hold tool is
  strict. The runtime must make Cerebras tool definitions uniformly non-strict
  (a provider-profile fact, reported to assistant-runtime for PR #138). Until
  it lands, both Cerebras models fail with that 400.

The selector also offers **GPT-6 Astra · Fast requested**, which sends
`config.codex_service_tier: "fast"` per request; the launch env keeps the tier
fallback at `default`.
