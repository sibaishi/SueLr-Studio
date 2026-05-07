import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface LongTextEditorModalProps {
  title: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onCompositionStart?: () => void;
  onCompositionEnd?: (value: string) => void;
}

export function LongTextEditorModal({
  title,
  value,
  placeholder = '粘贴/输入文本...',
  onChange,
  onClose,
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
          <button type="button" className="long-text-editor-modal__close" onClick={onClose} aria-label="关闭全屏编辑">
            <X size={18} />
          </button>
        </div>
        <textarea
          ref={editorRef}
          value={value}
          placeholder={placeholder}
          className="long-text-editor-modal__textarea"
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event) => onCompositionEnd?.(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') onClose();
          }}
        />
        <div className="long-text-editor-modal__meta">
          {value ? value.split(/\r\n|\r|\n/).length : 0} 行 · {value.length} 字符
        </div>
      </div>
    </div>,
    document.body,
  );
}
