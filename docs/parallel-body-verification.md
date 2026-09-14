# Independent body control: implementation and verification

Tracks [Avatar Studio #32](https://github.com/eandualem/avatar-studio/issues/32)
and depends on [assistant-runtime #123](https://github.com/eandualem/assistant-runtime/pull/123).
Elias resumed implementation on September 14, 2026. Implementation is on
`feat/parallel-body-control`, built separately at `/tmp/avatar-studio-parallel`.
The original running checkout and all earlier runtime instances are preserved
while this branch is reviewed. Runtime dependency merged as `6e10c33`; application landing evidence follows below.

## Operating contract

- `VoiceClient` requests `mode: "conversation"`, passes bounded user/assistant
  history, and requires `conversation_mode_supported` before microphone access.
  It installs the conversation-only policy before unmuting. Backend/delegation
  events have no execution or visible-message handler.
- `BodyController` waits for 900 ms without new user fragments. Live provides no
  transcript-done event. Acoustic gaps of at least 1.5 seconds distinguish body
  utterances; interleaved assistant fragments do not split a user's utterance.
  New text invalidates pending decisions immediately. Snapshot/replay input is
  context only, and an admitted utterance does not execute twice.
- Every decision gets a new session UUID. Cancellation in assistant-runtime is
  session-scoped and has no pre-arrival tombstone, so old sessions are never
  reused. The app rejects stale responses again immediately before execution.
- Native `host_tools` output allows only the advertised procedural `move_avatar`,
  `hold_avatar`, `stop_avatar`, or runtime-native hold. Move metadata declares
  explicit/incidental intent and a short physical label. The runtime admits one
  tool, suppresses model prose, and records final receipts without another LLM
  call. The app also rejects prose/nonterminal/unknown output.
- Explicit motion and requested stillness take priority over incidental motion.
  Ordinary speech does not stop an active run. A new explicit movement replaces
  it. Stop/reset invalidate pending work synchronously and stop the engine
  independently of provider latency. Clear spoken stop commands have a narrow
  immediate path; richer stop phrasing uses the controller's stop tool.
- The first successful rig frame emits started. The app sends bounded quiet
  `session.thinking.append` engine facts with `delegation_id: null`. Event IDs
  correlate acknowledgments; a timeout never retries movement. Constraints,
  cancellation and failure remain distinct from success.
- User/Live messages persist in browser conversation history. Internal movement
  traces are saved separately on the conversation and can be copied during or
  after a call. They include utterance readiness, controller request/return,
  engine start/end, audible output onset and quiet-context acknowledgment times.
  Times use the call page's monotonic clock. They do not prove exact word/gesture
  synchronization or that every audible claim was accurate.
- Typed messages after hangup go to the text runtime, carrying visible history;
  the independent body runtime never becomes a text-chat backend.

## Runtime activation

The assistant-runtime agent activated isolated **7114** from merged `6e10c33`
on September 14, 2026. Source: `/tmp/assistant-runtime-parallel-body`; private
state/launcher: `/tmp/avatar-codex-7114`. No reload or process replacement.
Health returns 200; voice status confirms conversation-mode support, delegation
disabled, configured access, and zero active calls before testing. Codex CLI sync
confirmed subscription access. The saved overlay is identical to 7113: Sol with
4000 thinking budget (low mapping), API fallback disabled, working memory off.
Both body and Live instruction files are copied into private state, so removal
of the application task worktree cannot break startup. Original runtimes and
histories remain intact; typed chat stays on 7112. The new voice/body URLs are
7114. No paid voice allocation was used to check readiness.

## Verification

All 85 tests, TypeScript, lint and production build pass locally.

Offline tests cover greeting/question scheduling, coalescing, correction before
admission, duplicate/replay/snapshot handling, delayed model returns, priority,
explicit stop/replacement/stillness, silent receipts, unknown tools, context size
(including multilingual text), audio lifecycle, and engine-confirmed starts.
Browser verification uses `tests/fixtures/parallel-preview.tsx` through a temporary
`app/parallel-preview/page.tsx` import. The fixture replaces microphone, WebRTC,
voice HTTP and SSE locally; it cannot allocate a Live call. Its optional
subscription-body checkbox forwards only body chat/receipts to the isolated
runtime. The temporary route must be removed before production build/commit.

Initial synthetic greeting completed on the actual rig in 2.54 seconds; its
first frame arrived in 2.9 ms. Solver timing extension and wrist limits were
returned in the receipt. Only user/Live speech appeared in the conversation.
A synthetic explicit run then stayed active while a new conversation utterance
appeared; Stop removed movement immediately while the voice connection stayed
active. Reset restored the initial pose. Desktop and 390 × 844 mobile controls
fit the panel, and movement details remained available after hangup. A fixture
lookup error was fixed during testing; it was not a production motion failure.

A browser check of the ordinary Live-start control was rejected by automatic
approval review because it could request microphone access or allocate a paid
call. No allocation occurred. The safer synthetic fixture was then used.
No agent-paid Live call is authorized or performed; Elias's real microphone
trial remains the subjective/protocol acceptance boundary.

## Known limits and next trial

The provider's deltas do not define complete utterances. The 900 ms quiet period
is an application heuristic, so a long pause may start a decision before the
speaker finishes. Corrections received before admission supersede planning;
late fragments of an already admitted utterance do not repeat the motion.
Tool intent classification is model-generated. Numerical motion validation and
explicit-over-incidental admission are deterministic, but natural expression
and every interpretation of a movement request still require real trials.

Use a new Live conversation after activation. Try a plain greeting, an ordinary
question, an explicit wave/run, conversation during the run, and Stop/reset.
Verify movement is independent of Live delegation, only conversation is visible,
and Live does not claim motion before a confirmed start. Copy movement details
for delays or contradictions. Do not treat synthetic or typed model tests as
successful real Live acceptance.

Protocol references: [Live transcript events](https://developers.openai.com/api/reference/typescript/resources/live)
and [quiet context and acknowledgment semantics](https://developers.openai.com/api/docs/guides/live-delegation).
