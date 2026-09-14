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

Runtime correction and activation are tracked alongside
[issue #34](https://github.com/eandualem/avatar-studio/issues/34). Existing runtime
processes and histories must remain intact. Real Live acceptance remains Elias-run.
