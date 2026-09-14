# Live session setup recovery (issue #34)

Elias’s first real Live trial after parallel body activation returned two HTTP
502 setup failures from 7114. The provider response body was discarded by the
runtime, so the exact historical rejection cannot be recovered. The runtime
reported zero active calls afterward; that count alone does not prove provider
finalization.

The new conversation-mode request sent `client.data_channel` as an array.
The [official Live schema](https://developers.openai.com/api/reference/typescript/resources/live)
requires an object containing `allowed_client_events`. This is a confirmed
request defect and the likely cause of the reported rejection. It is not evidence
of a credential or billing problem.

## App error contract

A failed create response may include `allocation_status: "rejected"` when the
runtime has definitive evidence that no provider call was allocated. The app
preserves that metadata on its HTTP error and releases local media without
adding an uncertain-allocation warning. The original runtime error remains
visible. Missing, invalid or `"unknown"` metadata remains uncertain, including
errors from older runtimes, network failures and lost responses. HTTP status
alone never establishes allocation state. The app never retries creation.

If a call ID arrives after cancellation, or an otherwise malformed answer still
contains a valid call ID, the app continues to close that known call through the
runtime. Provider close failures still retain their finalization warning.

## Verification

96 app tests, TypeScript, lint and the production build pass. Regression tests
cover the visible error through the conversation machine, microphone/peer cleanup,
ambiguous HTTP/network failures, legacy and malformed error bodies, and metadata
parsing. Existing late-allocation and malformed-answer cleanup tests also pass.
No microphone access or provider allocation was used for these tests.

The runtime’s HTTP-boundary test uses a fake provider with the documented
permissions schema: the old array fails validation and the corrected nested
object passes through the real service and HTTP transport. Failure cases cover
rejection, timeout and sideband attach failure, preserving allocation metadata
and releasing local session reservations without retrying or exposing request
payloads. See [runtime issue #124](https://github.com/eandualem/assistant-runtime/issues/124).

## Delivery and activation

Runtime [PR #125](https://github.com/eandualem/assistant-runtime/pull/125) merged
as `fcd87b45857687810c0f06a1e912018a1fb399fb`. Its 2,348 local tests, lint/format,
and all four GitHub Python/compatibility jobs pass. Independent surveyor review
is clear after correcting ambiguous HTTP 499 and post-create attachment errors.
CodeRabbit returned a rate-limit notice without a review; the runtime repository
has no rule requiring that optional review to finish before merge.

The corrected runtime is isolated on **7115**, PID **2484**, from
`/tmp/assistant-runtime-live-create-fix`; private state and launcher are in
`/tmp/avatar-codex-7115`. Do not edit that active source or replace its process
when preserving in-memory history. Read-only readiness confirms health HTTP 200,
configured GPT-Live, conversation mode supported, delegation disabled and zero
active calls before Elias retries. Prompts and subscription settings match 7114.

The app on 7140 now routes voice to 7115. Body stays on 7114 and text on 7112;
all older runtime instances and histories remain intact. The prior ignored app
configuration is backed up in `.tmp/pre-live-setup-fix.env.local`. Use a refreshed
app and **New conversation → Talk live** for the corrected setup.

The runtime peer reviewed the app's conservative error-metadata consumer. All
96 app tests and type/lint/build checks pass. GitHub's app job could not start
because of account billing; the PR records matching local evidence and the
absence of required branch gates. Real Live acceptance remains Elias-run;
this correction was verified without microphone access or paid allocation.
