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
  Plus,
  Square,
  X,
} from "lucide-react";
import {
  StudioProvider,
  useAvatar,
  useConversation,
  useSpeech,
} from "@/hooks/useStudio";

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
    chat = useConversation();
  const [draft, setDraft] = useState(""),
    [sidebar, setSidebar] = useState(false);
  const speech = useSpeech((text) =>
    setDraft((previous) => `${previous}${previous ? " " : ""}${text}`),
  );
  const bottom = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const busy = chat.state !== "idle";
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
          <span className="eyebrow">A LITTLE MORE HUMAN</span>
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
        <div className="stage-caption">
          <h1>
            A face to talk to.
            <br />A space to think.
          </h1>
          <p>
            Here for the small questions.
            <br className="mobile-break" /> And the big possibilities.
          </p>
        </div>
        <span className="stage-signature">
          <span /> PRESENT, WITH YOU
        </span>
      </section>
      <section
        className="conversation-panel"
        aria-label="Conversation with Charlie"
      >
        <header className="conversation-heading">
          <div className="heading-row">
            <span className="eyebrow">YOUR SPACE TO EXPLORE</span>
            <AudioLines size={20} />
          </div>
          <h2>Let’s think together.</h2>
          <p>
            Ideas, questions, rough drafts — you bring it,
            <br className="desktop-break" /> we’ll figure it out together.
          </p>
        </header>
        <div
          className="messages"
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
                </span>
                <div className="bubble">{message.content}</div>
              </div>
            </article>
          ))}
          {busy && (
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
        <div className="composer-area">
          {(chat.data.error || speech.data.error) && (
            <p className="error-message" role="alert">
              {chat.data.error || speech.data.error}
            </p>
          )}
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
          <p className="composer-note">
            {listening ? (
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
