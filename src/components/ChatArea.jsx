import { useRef, useEffect } from 'react';
import Message from './Message';
import './ChatArea.css';

const SUGGESTIONS = [
  {
    title: 'Revenue & Growth',
    desc: 'What was Coforge revenue growth in FY26?',
  },
  {
    title: 'Acquisitions',
    desc: 'Tell me about the Encora acquisition',
  },
  {
    title: 'Margins & Profitability',
    desc: 'What are Coforge operating margins in FY26?',
  },
  {
    title: 'Earnings Highlights',
    desc: 'Q4 FY26 earnings call key takeaways',
  },
];

export default function ChatArea({
  messages,
  isLoading,
  onSend,
  disabled,
}) {
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const hasMessages = messages.length > 0 || isLoading;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (text) => {
    const trimmed = text?.trim();
    if (!trimmed || disabled || isLoading) return;
    onSend(trimmed);
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e.target.value);
    }
  };

  const handleInput = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  return (
    <div className="chat-area">
      <div className="chat-header">Coforge Knowledge Assistant</div>

      <div className="messages-container">
        {!hasMessages ? (
          <div className="welcome-screen">
            <h1>How can I help you today?</h1>
            <p>
              Ask questions about Coforge annual reports, investor presentations,
              and earnings transcripts.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  className="suggestion-card"
                  onClick={() => handleSubmit(s.desc)}
                  disabled={disabled || isLoading}
                >
                  <div className="title">{s.title}</div>
                  <div className="desc">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <Message
                key={msg.id}
                role={msg.role}
                content={msg.content}
                sources={msg.sources}
              />
            ))}
            {isLoading && (
              <Message role="assistant" isLoading />
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <div className="chat-input-box">
            <textarea
              ref={textareaRef}
              placeholder="Ask about Coforge financials, earnings, acquisitions..."
              rows={1}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              disabled={disabled || isLoading}
            />
            <button
              className="send-btn"
              disabled={disabled || isLoading}
              onClick={() => handleSubmit(textareaRef.current?.value)}
              title="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <div className="input-hint">
            Answers are based on Coforge AR, PPT, and Earnings Transcripts
          </div>
        </div>
      </div>
    </div>
  );
}
