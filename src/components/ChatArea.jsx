import { useRef, useEffect, useState, useCallback } from 'react';
import Message from './Message';
import { getCompanyConfig } from '../lib/companies';
import { useSpeechToText } from '../lib/useSpeechToText';
import './ChatArea.css';

function resizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
}

export default function ChatArea({
  company,
  companies,
  onCompanyChange,
  messages,
  isLoading,
  onSend,
  disabled,
}) {
  const config = getCompanyConfig(company);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const [voiceHint, setVoiceHint] = useState('');
  const hasMessages = messages.length > 0 || isLoading;

  const setTextareaValue = useCallback((value) => {
    if (!textareaRef.current) return;
    textareaRef.current.value = value;
    resizeTextarea(textareaRef.current);
  }, []);

  const handleTranscript = useCallback(
    (text) => {
      setTextareaValue(text);
    },
    [setTextareaValue]
  );

  const { isSupported, isListening, toggleListening, stopListening } = useSpeechToText({
    onTranscript: handleTranscript,
    onFinalTranscript: (text) => {
      setTextareaValue(text);
      setVoiceHint('');
    },
    onError: (message) => {
      setVoiceHint(message);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    stopListening();
    setVoiceHint('');
  }, [company, stopListening]);

  const handleSubmit = (text) => {
    const trimmed = text?.trim();
    if (!trimmed || disabled || isLoading) return;
    stopListening();
    onSend(trimmed);
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
    setVoiceHint('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e.target.value);
    }
  };

  const handleInput = (e) => {
    resizeTextarea(e.target);
    if (voiceHint) setVoiceHint('');
  };

  const handleVoiceToggle = () => {
    toggleListening(textareaRef.current?.value || '');
    if (!isListening) {
      setVoiceHint('Listening... speak your question.');
    }
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="company-tabs">
          {companies.map((companyId) => {
            const tab = getCompanyConfig(companyId);
            return (
              <button
                key={companyId}
                type="button"
                className={`company-tab ${company === companyId ? 'active' : ''}`}
                onClick={() => onCompanyChange(companyId)}
              >
                {tab.tabLabel}
              </button>
            );
          })}
        </div>
        <div className="chat-header-title">{config.title}</div>
      </div>

      <div className="messages-container">
        {!hasMessages ? (
          <div className="welcome-screen">
            <h1>How can I help you today?</h1>
            <p>{config.welcome}</p>
            <div className="suggestions">
              {config.suggestions.map((s) => (
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
          <div className={`chat-input-box ${isListening ? 'listening' : ''}`}>
            <textarea
              ref={textareaRef}
              placeholder={config.placeholder}
              rows={1}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              disabled={disabled || isLoading}
            />
            <div className="chat-input-actions">
              {isSupported && (
                <button
                  type="button"
                  className={`voice-btn ${isListening ? 'active' : ''}`}
                  disabled={disabled || isLoading}
                  onClick={handleVoiceToggle}
                  title={isListening ? 'Stop voice input' : 'Voice to text'}
                  aria-label={isListening ? 'Stop voice input' : 'Start voice to text'}
                  aria-pressed={isListening}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
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
          </div>
          <div className={`input-hint ${voiceHint ? 'voice-status' : ''}`}>
            {voiceHint || (isSupported ? `${config.hint} · Click the mic for voice to text` : config.hint)}
          </div>
        </div>
      </div>
    </div>
  );
}
