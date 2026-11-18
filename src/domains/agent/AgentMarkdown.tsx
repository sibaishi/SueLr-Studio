import { memo, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { downloadBlob } from '@/domains/workflow/lib/fileArchive';

function CopySourceButton({ source, label }: { source: string; label: string }) {
  const [feedback, setFeedback] = useState('');

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(source);
            setFeedback('已复制');
          } catch {
            setFeedback('复制失败');
          }
        }}
      >
        {label}
      </button>
      {feedback && <span role="status">{feedback}</span>}
    </>
  );
}

function downloadMarkdown(source: string, filename: string) {
  downloadBlob(new Blob([source], { type: 'text/markdown;charset=utf-8' }), filename);
}

function CodeBlock({ source, language }: { source: string; language?: string }) {
  const isMarkdown = /^(?:md|markdown)$/i.test(language ?? '');
  const [showSource, setShowSource] = useState(!isMarkdown);
  const [wrap, setWrap] = useState(true);

  return (
    <div className="agent-markdown__block">
      <div className="agent-markdown__toolbar">
        <span className="agent-markdown__language">{isMarkdown ? 'Markdown' : language || '代码'}</span>
        {isMarkdown && (
          <button type="button" onClick={() => setShowSource(!showSource)}>
            {showSource ? '查看预览' : '查看原文'}
          </button>
        )}
        {showSource && (
          <button type="button" onClick={() => setWrap(!wrap)}>
            {wrap ? '关闭换行' : '开启换行'}
          </button>
        )}
        <CopySourceButton source={source} label={isMarkdown ? '复制 Markdown 原文' : '复制代码'} />
        {isMarkdown && (
          <button type="button" onClick={() => downloadMarkdown(source, '弧光文档.md')}>下载文档 .md</button>
        )}
      </div>
      {showSource ? (
        <pre className={wrap ? 'agent-markdown__code agent-markdown__code--wrap' : 'agent-markdown__code'}>
          <code>{source}</code>
        </pre>
      ) : (
        <div className="agent-markdown__preview"><MarkdownBody source={source} /></div>
      )}
    </div>
  );
}

const components: Components = {
  pre({ node, children }) {
    const code = node?.children[0];
    if (code?.type !== 'element' || code.tagName !== 'code') return <pre>{children}</pre>;
    const classes = code.properties.className;
    const language = Array.isArray(classes)
      ? classes.find((entry) => typeof entry === 'string' && entry.startsWith('language-'))
      : undefined;
    const source = code.children.map((child) => child.type === 'text' ? child.value : '').join('').replace(/\n$/, '');
    return <CodeBlock source={source} language={typeof language === 'string' ? language.slice(9) : undefined} />;
  },
  table({ children }) {
    return <div className="agent-markdown__table"><table>{children}</table></div>;
  },
  a({ href, children }) {
    if (!href || !/^https?:\/\//i.test(href)) return <>{children}</>;
    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
  },
  img({ alt }) {
    return alt ? <span>{alt}</span> : null;
  },
};

function MarkdownBody({ source }: { source: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
      {source}
    </Markdown>
  );
}

export default memo(function AgentMarkdown({ source }: { source: string }) {
  const startsWithHeading = /^(?: {0,3}#{1,6}(?:[ \t]|$)|[^\r\n]+\r?\n {0,3}(?:=+|-+)[ \t]*(?:\r?\n|$))/.test(source.trimStart());
  return (
    <>
      <div className="agent-markdown"><MarkdownBody source={source} /></div>
      {startsWithHeading && (
        <div className="agent-markdown__toolbar agent-markdown__reply-actions">
          <CopySourceButton source={source} label="复制回复原文" />
          <button type="button" onClick={() => downloadMarkdown(source, '弧光回复.md')}>下载回复 .md</button>
        </div>
      )}
    </>
  );
});
