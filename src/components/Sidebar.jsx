import { useState } from 'react';
import './Sidebar.css';

export default function Sidebar({ threads, activeThreadId, onSelectThread, onNewChat, onDeleteThread }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <div className="brand-icon" aria-hidden="true">
            C
          </div>
          <div className="brand-text">
            <span className="brand-name">Chola</span>
            <span className="brand-tagline">CIFC Knowledge Assistant</span>
          </div>
        </div>
      </div>
      <div className="sidebar-header">
        <button type="button" className="new-chat-btn" onClick={onNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
      </div>

      <div className="thread-list">
        {threads.length === 0 ? (
          <p className="thread-list-empty">Start a new chat to explore CIFC reports and transcripts.</p>
        ) : null}
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={`thread-item ${thread.id === activeThreadId ? 'active' : ''}`}
            onClick={() => onSelectThread(thread.id)}
            onMouseEnter={() => setHoveredId(thread.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="thread-title">{thread.title || 'New chat'}</span>
            {(hoveredId === thread.id || thread.id === activeThreadId) && (
              <button
                className="delete-thread-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteThread(thread.id);
                }}
                title="Delete chat"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">Full-library research · 26 CIFC documents</div>
    </aside>
  );
}
