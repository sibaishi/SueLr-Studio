import ReactMarkdown from 'react-markdown';
import { useT } from '../contexts/ThemeContext';

export function MarkdownRenderer({ content, isUser }: { content: string; isUser: boolean }) {
  const T = useT();
  return (
    <ReactMarkdown components={{
      p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
      code: ({ className, children }) => {
        const isBlock = !!className;
        const code = String(children);
        if (isBlock) {
          return (
            <pre style={{
              background: isUser ? 'rgba(0,0,0,0.2)' : T.bg,
              borderRadius: 8, padding: 10, fontSize: 12, overflowX: 'auto',
              margin: '6px 0', border: isUser ? 'none' : `1px solid ${T.border}`,
            }}>
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <code style={{
            background: isUser ? 'rgba(0,0,0,0.2)' : T.card2,
            padding: '1px 5px', borderRadius: 4, fontSize: 12,
          }}>{code}</code>
        );
      },
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: isUser ? '#fff' : T.blue, textDecoration: 'underline' }}>{children}</a>
      ),
      ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ul>,
      ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol>,
      li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
      blockquote: ({ children }) => (
        <blockquote style={{ borderLeft: `3px solid ${isUser ? 'rgba(255,255,255,0.4)' : T.border}`, margin: '6px 0', paddingLeft: 10, opacity: 0.85 }}>{children}</blockquote>
      ),
      h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h1>,
      h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h2>,
      h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: '6px 0 4px' }}>{children}</h3>,
      strong: ({ children }) => <strong>{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${isUser ? 'rgba(255,255,255,0.3)' : T.border}`, margin: '8px 0' }} />,
      table: ({ children }) => <table style={{ borderCollapse: 'collapse', margin: '6px 0', width: '100%' }}>{children}</table>,
      th: ({ children }) => <th style={{ border: `1px solid ${isUser ? 'rgba(255,255,255,0.3)' : T.border}`, padding: '4px 8px', fontWeight: 600 }}>{children}</th>,
      td: ({ children }) => <td style={{ border: `1px solid ${isUser ? 'rgba(255,255,255,0.3)' : T.border}`, padding: '4px 8px' }}>{children}</td>,
    }}>{content}</ReactMarkdown>
  );
}
