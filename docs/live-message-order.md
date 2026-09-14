# Live conversation ordering

Issue #24 fixes a display bug: `VoiceClient` previously rendered all spoken
transcripts followed by all delegated backend replies. A new user utterance
therefore appeared above earlier Charlie full responses, even though the
runtime delivered the events in order.

Each backend response now keeps the transcript-index position where its first
visible text arrived. Live transcript fragments and full responses are interleaved
at those positions. Streaming updates and finalization keep the same display ID
and slot. A tool continuation without intervening user speech still extends its
existing bubble; a new continuation after user speech gets a new bubble below
that utterance. Final text replaces only the current streamed turn, not earlier
continuation text. Speech fragments do not merge across an intervening full reply.

Runtime snapshots contain the complete append-only transcript in delivery order,
so `(call_id, transcript_index)` remains stable. Existing backend anchors survive
snapshot reconciliation. Duplicate SSE cursors are ignored. A replayed backend
update arriving after a REST snapshot updates its known slot without splitting
against newer snapshot speech. If its original backend response was never seen,
the snapshot lacks enough information to recover its exact position: that
response is explicitly labeled “Recovered response · original order unavailable.”
Audio millisecond offsets are not mixed with backend wall-clock timestamps.

Assistant-runtime inspected a retained 7112 demo call: transcript order matched
its replay and repeated final responses used the same backend message ID. No
runtime source/config/auth changes, restarts or paid voice calls were needed.
The old concatenated order already saved in local history cannot be reconstructed
reliably because those saved messages have no cross-source ordering metadata.
This update preserves old history and fixes new live calls after refreshing the
app. It cannot change an already-recorded video.

Validation: 73 tests, TypeScript, ESLint and production build pass. Regression
coverage includes new requests after old replies, late finalization, stable IDs,
continuations around user speech, full snapshots, replay and close. An isolated
browser copy uses `tests/fixtures/live-order.ts` with the real message builder and
Studio renderer; no real runtime connection or microphone is needed.

The browser preview verified all three successive stages through the actual
Studio renderer, including the continuation below the newer request. At 390×844,
the same order remained visible without horizontal overflow. Live event delivery,
streaming finalization and reconnect logic are covered by the VoiceClient tests;
this preview did not allocate an actual Live call. GitHub application CI could not
start because of account billing/spending limits (job 103967300844); no required
checks or automated review comments were reported at final review.
