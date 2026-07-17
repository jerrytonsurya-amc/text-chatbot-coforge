import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './Message.css';

export default function Message({ role, content, sources, isLoading }) {
  const isUser = role === 'user';

  return (
    <div className={`message ${role}`}>
      <div className="message-inner">
        <div className="message-avatar">
          {isUser ? 'U' : 'C'}
        </div>
        <div className="message-content">
          {isLoading ? (
            <div className="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          ) : isUser ? (
            <p>{content}</p>
          ) : (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {sources && sources.length > 0 && (
                <div className="message-sources">
                  <div className="message-sources-label">Sources</div>
                  <div className="message-sources-list">
                    {sources.map((src, i) => (
                      <span key={i} className="source-tag">{src}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
