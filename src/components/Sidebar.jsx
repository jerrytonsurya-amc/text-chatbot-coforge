import { useState } from 'react';
import './Sidebar.css';

export default function Sidebar({ threads, activeThreadId, activeCompany, onSelectThread, onNewChat, onDeleteThread }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="new-chat-btn" onClick={onNewChat}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
      </div>

      <div className="thread-list">
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

      <div className="sidebar-footer">
        {activeCompany === 'CIFC' ? 'Cholamandalam (CIFC) Knowledge Assistant' : 'Coforge Knowledge Assistant'}
      </div>
    </aside>
  );
}
