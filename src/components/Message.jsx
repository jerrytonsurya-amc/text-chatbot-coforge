import { useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ensureNumericTables } from '../lib/formatMarkdown';
import { extractMarkdownTables, tableToChartData } from '../lib/parseTable';
import TableWithChart from './TableWithChart';
import './Message.css';

export default function Message({ role, content, sources, isLoading }) {
  const isUser = role === 'user';
  const formattedContent = isUser ? content : ensureNumericTables(content);
  const tableIndexRef = useRef(0);

  const tables = useMemo(
    () => extractMarkdownTables(formattedContent).map(tableToChartData),
    [formattedContent]
  );

  tableIndexRef.current = 0;

  const markdownComponents = useMemo(
    () => ({
      table: ({ children }) => {
        const idx = tableIndexRef.current;
        tableIndexRef.current += 1;
        const chartData = tables[idx];

        return (
          <TableWithChart chartData={chartData}>
            {children}
          </TableWithChart>
        );
      },
    }),
    [tables]
  );

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
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {formattedContent}
              </ReactMarkdown>
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
