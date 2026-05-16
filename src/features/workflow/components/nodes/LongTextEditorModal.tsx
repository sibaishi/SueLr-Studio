import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface LongTextEditorModalProps {
  title: string;
  value: string;
  segments?: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  readOnly?: boolean;
  onCompositionStart?: () => void;
  onCompositionEnd?: (value: string) => void;
}

export function LongTextEditorModal({
  title,
  value,
  segments,
  placeholder = '粘贴/输入文本...',
  onChange,
  onClose,
  readOnly = false,
  onCompositionStart,
  onCompositionEnd,
}: LongTextEditorModalProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className="long-text-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="long-text-editor-modal__dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="long-text-editor-modal__header">
          <div>
            <div className="long-text-editor-modal__title">{title}</div>
          </div>
          <button type="button" className="long-text-editor-modal__close" onClick={onClose} aria-label={readOnly ? '关闭全屏查看' : '关闭全屏编辑'}>
            <X size={18} />
          </button>
        </div>
        {segments ? (
          <div
            className="long-text-editor-modal__segments"
            tabIndex={0}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') onClose();
            }}
          >
            {segments.map((segment, index) => (
              <section key={`segment-${index + 1}`} className="long-text-editor-modal__segment">
                <div className="long-text-editor-modal__segment-title">片段 {index + 1}</div>
                <div className={segment ? 'long-text-editor-modal__segment-text' : 'long-text-editor-modal__segment-text long-text-editor-modal__segment-text--empty'}>
                  {segment || '空片段'}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <textarea
            ref={editorRef}
            value={value}
            placeholder={placeholder}
            className="long-text-editor-modal__textarea"
            readOnly={readOnly}
            onChange={(event) => onChange(event.target.value)}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={(event) => onCompositionEnd?.(event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') onClose();
            }}
          />
        )}
        <div className="long-text-editor-modal__meta">
          {segments
            ? `${segments.length} 段 · ${segments.reduce((total, segment) => total + segment.length, 0)} 字符`
            : `${value ? value.split(/\r\n|\r|\n/).length : 0} 行 · ${value.length} 字符`}
        </div>
      </div>
    </div>,
    document.body,
  );
}
