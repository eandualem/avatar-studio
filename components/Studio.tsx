"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  AudioLines,
  Check,
  ChevronDown,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  Plus,
  Square,
  X,
} from "lucide-react";
import {
  StudioProvider,
  useAvatar,
  useConversation,
  useSpeech,
  useVoice,
  useMotionLab,
} from "@/hooks/useStudio";
import { MotionLab } from "./MotionLab";
import { BodyTiming } from "./BodyTiming";
import { VoicePhase } from "@/types/voice";

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden="true" className={`mark ${small ? "small" : ""}`}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function Workspace() {
  const {
      state: avatarState,
      data: avatarData,
      actions: { canvasRef, retry: retryAvatar },
    } = useAvatar(),
    chat = useConversation(),
    voice = useVoice();
  const lab = useMotionLab();
  const [draft, setDraft] = useState(""),
    [sidebar, setSidebar] = useState(false);
  const speech = useSpeech((text) =>
    setDraft((previous) => `${previous}${previous ? " " : ""}${text}`),
  );
  const bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const busy = chat.state !== "idle";
  const live = voice.state !== VoicePhase.Idle;
  const voiceReady = voice.state === VoicePhase.Active;
  const voiceStatus =
    voice.state === VoicePhase.Connecting
      ? "Voice · Connecting"
      : voice.state === VoicePhase.Closing
        ? "Voice · Ending call"
        : voice.state === VoicePhase.Cancelling
          ? "Body · Stopping"
          : voice.data.view?.soundBlocked
            ? "Voice · Enable sound"
            : voice.data.view?.speaking
              ? "Voice · Speaking"
              : voice.data.view?.micMuted
                ? "Voice · Microphone muted"
                : "Voice · Listening";
  const listening = speech.state === "listening";
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat.data.current.messages, chat.state]);
  const send = (text = draft) => {
    if (!text.trim() || busy || listening) return;
    chat.actions.send(text);
    setDraft("");
  };
  const status =
    avatarState === "failed"
      ? "Avatar unavailable"
      : avatarState !== "ready"
        ? "Getting ready"
        : lab.active
          ? lab.running
            ? "Testing movement"
            : "Dev test ready"
          : live
            ? voiceStatus
            : listening
              ? "Listening to you"
              : chat.state === "moving"
                ? "Expressing a thought"
                : busy
                  ? "Thinking with you"
                  : "Ready to listen";
  return (
    <main className="studio">
      <button
        className="mobile-history icon-button"
        aria-label="Open conversations"
        onClick={() => setSidebar(true)}
      >
        <MessageCircle size={20} />
      </button>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close conversations"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <Link className="brand" href="/" aria-label="Avatar Studio home">
          <Mark />
          <span>Assistant</span>
        </Link>
        <button
          className="close-sidebar icon-button"
          aria-label="Close conversations"
          onClick={() => setSidebar(false)}
        >
          <X size={20} />
        </button>
        <button
          className="new-chat"
          disabled={busy}
          onClick={() => {
            chat.actions.newConversation();
            setDraft("");
            setSidebar(false);
          }}
        >
          <Plus size={18} />
          New conversation
        </button>
        <div className="history-label">YOUR CONVERSATIONS</div>
        <nav aria-label="Conversation history">
          {chat.data.history
            .filter((c) => c.messages.length)
            .map((c) => (
              <button
                key={c.id}
                disabled={busy}
                className={`history-item ${c.id === chat.data.current.id ? "selected" : ""}`}
                onClick={() => {
                  chat.actions.select(c.id);
                  setDraft("");
                  setSidebar(false);
                }}
              >
                <MessageCircle size={15} />
                <span>{c.title}</span>
              </button>
            ))}
        </nav>
        {!chat.data.history.some((c) => c.messages.length > 0) && (
          <p className="history-empty">
            A little room for
            <br />
            your next big thought.
          </p>
        )}
        <div className="sidebar-footer">
          <span className="mini-orb">C</span>
          <div>
            Charlie<span>Your thinking companion</span>
          </div>
          <ChevronDown size={14} />
        </div>
      </aside>
      <section
        className="avatar-panel"
        aria-label="Charlie, your interactive robot"
      >
        <div className="stage-top">
          <span
            className={`status ${busy || listening ? "active" : ""}`}
            role="status"
          >
            <span />
            {status}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Live 3D robot with movable arms, hands, legs, torso and head"
        />
        {avatarState === "failed" && (
          <div className="avatar-error">
            <p>{avatarData.error}</p>
            <button onClick={retryAvatar}>Try again</button>
          </div>
        )}
      </section>
      <section
        className="conversation-panel"
        aria-label="Conversation with Charlie"
      >
        <header className="conversation-heading">
          <div className="heading-row">
            <span className="eyebrow">YOUR SPACE TO EXPLORE</span>
            <div className="heading-actions">
              <label className="dev-toggle">
                <input
                  type="checkbox"
                  checked={lab.active}
                  aria-controls="motion-lab"
                  disabled={!lab.active && (busy || listening)}
                  onChange={() => (lab.active ? lab.close() : lab.open())}
                />
                Dev test
              </label>
              {live ? (
                <span className="live-heading">
                  <AudioLines size={18} /> Voice conversation
                </span>
              ) : (
                <button
                  className="live-start"
                  disabled={busy || listening || avatarState !== "ready"}
                  onClick={voice.actions.start}
                  aria-label="Start live conversation"
                >
                  <AudioLines size={18} /> Talk live
                </button>
              )}
              {!live && voice.data.savedTrace?.callId && (
                <button
                  type="button"
                  className="live-start"
                  onClick={voice.actions.copyMotion}
                >
                  {voice.data.copyStatus || "Copy Body details"}
                </button>
              )}
            </div>
          </div>
          <h2>
            {lab.active
              ? "Explore how Charlie moves."
              : "Let’s think together."}
          </h2>
          {!lab.active && (
            <p>
              Ideas, questions, rough drafts — you bring it,
              <br className="desktop-break" /> we’ll figure it out together.
            </p>
          )}
        </header>
        <MotionLab ready={avatarState === "ready"} />
        <div
          className="messages"
          hidden={lab.active}
          role="log"
          aria-label="Messages"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {!chat.data.current.messages.length && (
            <div className="welcome">
              <Mark small />
              <div>
                <p>Hi, I’m Charlie.</p>
                <p>
                  What’s on your mind? We can work through an idea, or you can
                  ask me to move.
                </p>
                <div className="suggestions">
                  {[
                    "Say hello with your hand",
                    "Show me a curious expression",
                    "Help me think through an idea",
                  ].map((text) => (
                    <button
                      key={text}
                      disabled={busy || avatarState !== "ready"}
                      onClick={() => send(text)}
                    >
                      {text}
                      <span>↗</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {chat.data.current.messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              {message.role === "assistant" && <Mark small />}
              <div>
                <span className="message-author">
                  {message.role === "user" ? "You" : "Charlie"}
                  {message.source === "voice"
                    ? " · Voice transcript"
                    : message.source === "backend"
                      ? message.orderUncertain
                        ? " · Recovered response · original order unavailable"
                        : " · Full response"
                      : ""}
                </span>
                <div className="bubble">{message.content}</div>
              </div>
            </article>
          ))}
          {busy && !live && (
            <div className="thinking">
              <span />
              <span />
              <span />
              <span className="thinking-label">
                {chat.state === "moving"
                  ? "Moving with your idea"
                  : chat.state === "cancelling"
                    ? "Stopping"
                    : "A thought is taking shape"}
              </span>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <div className="composer-area" hidden={lab.active}>
          <BodyTiming
            body={voice.data.view?.body ?? voice.data.savedTrace?.body}
          />
          {(chat.data.error ||
            speech.data.error ||
            voice.data.view?.warning) && (
            <p className="error-message" role="alert">
              {chat.data.error || speech.data.error || voice.data.view?.warning}
            </p>
          )}
          {live ? (
            <div
              className="live-controls"
              role="group"
              aria-label="Live conversation controls"
            >
              <div className="live-summary">
                <span role="status">{voiceStatus}</span>
                <span>
                  {Math.floor((voice.data.view?.elapsed || 0) / 60)}:
                  {String((voice.data.view?.elapsed || 0) % 60).padStart(
                    2,
                    "0",
                  )}
                </span>
              </div>
              {voice.data.view?.work && (
                <p className="live-work">{voice.data.view.work}</p>
              )}
              <div className="live-buttons">
                <button
                  type="button"
                  disabled={!voiceReady}
                  onClick={voice.actions.mute}
                  aria-label={
                    voice.data.view?.micMuted
                      ? "Unmute microphone"
                      : "Mute microphone"
                  }
                  aria-pressed={voice.data.view?.micMuted || false}
                >
                  {voice.data.view?.micMuted ? (
                    <MicOff size={18} />
                  ) : (
                    <Mic size={18} />
                  )}{" "}
                  {voice.data.view?.micMuted ? "Unmute" : "Mute"}
                </button>
                {voice.data.view?.soundBlocked && (
                  <button
                    type="button"
                    onClick={voice.actions.play}
                    disabled={!voiceReady}
                  >
                    <Volume2 size={18} /> Enable sound
                  </button>
                )}
                {voiceReady && (
                  <button
                    type="button"
                    onClick={voice.actions.stopWork}
                    disabled={!voiceReady}
                  >
                    <Square size={15} /> Stop movement
                  </button>
                )}
                <button
                  type="button"
                  className="end-call"
                  onClick={voice.actions.end}
                  disabled={voice.state === VoicePhase.Closing}
                >
                  <PhoneOff size={18} /> End call
                </button>
                <button
                  type="button"
                  onClick={voice.actions.resetPose}
                  disabled={!voiceReady}
                >
                  Reset pose
                </button>
                <button
                  type="button"
                  onClick={voice.actions.copyMotion}
                  disabled={!voiceReady}
                >
                  {voice.data.copyStatus || "Copy Body details"}
                </button>
              </div>
              <p className="live-note">
                Speak naturally. You can interrupt Charlie. End the call to
                release the microphone.
              </p>
            </div>
          ) : (
            <form
              className={`composer ${listening ? "listening" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <button
                type="button"
                className={`mic-button icon-button ${listening ? "recording" : ""}`}
                disabled={busy}
                aria-label={listening ? "Stop dictation" : "Dictate a message"}
                title="Dictate a message"
                onClick={() =>
                  listening ? speech.actions.stop() : speech.actions.start()
                }
              >
                {listening ? <Square size={16} /> : <Mic size={20} />}
              </button>
              <textarea
                ref={input}
                value={draft}
                maxLength={12000}
                rows={1}
                aria-label="Message Charlie"
                placeholder={listening ? "Listening…" : "What’s on your mind?"}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              {busy ? (
                <button
                  type="button"
                  className="send-button"
                  aria-label="Stop response or movement"
                  onClick={chat.actions.stop}
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Send message"
                  disabled={!draft.trim() || listening}
                >
                  <ArrowUp size={21} />
                </button>
              )}
            </form>
          )}
          <p className="composer-note">
            {live ? (
              "Live audio uses OpenAI API credit while connected."
            ) : listening ? (
              "Speak naturally. You can edit before sending."
            ) : (
              <>
                <Check size={12} /> A little conversation. A new possibility.
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
export default function Studio() {
  return (
    <StudioProvider.Provider>
      <Workspace />
    </StudioProvider.Provider>
  );
}
