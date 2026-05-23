import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface LongTextEditorModalProps {
  title: string;
  value: string;
  segments?: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  onSegmentsChange?: (segments: string[]) => void;
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
  onSegmentsChange,
  onClose,
  readOnly = false,
  onCompositionStart,
  onCompositionEnd,
}: LongTextEditorModalProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const segmentRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  useEffect(() => {
    segmentRefs.current.forEach((textarea) => {
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }, [segments]);

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
                <label className="long-text-editor-modal__segment-title" htmlFor={`segment-editor-${index + 1}`}>
                  片段 {index + 1}
                </label>
                <textarea
                  id={`segment-editor-${index + 1}`}
                  ref={(element) => {
                    segmentRefs.current[index] = element;
                  }}
                  className="long-text-editor-modal__segment-text"
                  value={segment}
                  placeholder="输入片段内容..."
                  readOnly={readOnly || !onSegmentsChange}
                  onChange={(event) => {
                    const nextSegments = [...segments];
                    nextSegments[index] = event.target.value;
                    event.currentTarget.style.height = 'auto';
                    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                    onSegmentsChange?.(nextSegments);
                  }}
                  onCompositionStart={onCompositionStart}
                  onCompositionEnd={(event) => {
                    const nextSegments = [...segments];
                    nextSegments[index] = event.currentTarget.value;
                    onSegmentsChange?.(nextSegments);
                    onCompositionEnd?.(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Escape') onClose();
                  }}
                />
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
