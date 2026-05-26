import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { LongTextEditorModal } from './LongTextEditorModal';
import { useBufferedStringField } from './useBufferedStringField';

export function TextInputContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreenEditing, setIsFullscreenEditing] = useState(false);
  const previewClickTimerRef = useRef<number | null>(null);
  const text = (data.text as string) || '';
  const lineCount = text ? text.split(/\r\n|\r|\n/).length : 0;
  const showLongTextHint = text.length > 1000;
  const editor = useBufferedStringField(text, (nextValue) => updateNodeData(nodeId, { text: nextValue }));

  useEffect(() => {
    return () => {
      if (previewClickTimerRef.current !== null) {
        window.clearTimeout(previewClickTimerRef.current);
      }
    };
  }, []);

  const handlePreviewClick = () => {
    if (previewClickTimerRef.current !== null) {
      window.clearTimeout(previewClickTimerRef.current);
    }
    previewClickTimerRef.current = window.setTimeout(() => {
      previewClickTimerRef.current = null;
      setIsEditing(true);
    }, 180);
  };

  const handlePreviewDoubleClick = () => {
    if (previewClickTimerRef.current !== null) {
      window.clearTimeout(previewClickTimerRef.current);
      previewClickTimerRef.current = null;
    }
    setIsFullscreenEditing(true);
  };

  return (
    <div className="node-content-shell node-content-shell--text" style={outerStyle}>
      {isEditing ? (
        <textarea
          value={editor.value}
          onChange={(event) => editor.onChange(event.target.value)}
          onBlur={(event) => {
            editor.onBlur(event.target.value);
            setIsEditing(false);
          }}
          onFocus={() => editor.onFocus()}
          onCompositionStart={() => editor.onCompositionStart()}
          onCompositionEnd={(event) => editor.onCompositionEnd(event.currentTarget.value)}
          className="node-text-editor nodrag"
          placeholder="粘贴/输入文本..."
          onDoubleClick={() => setIsFullscreenEditing(true)}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        />
      ) : (
        <div
          onClick={handlePreviewClick}
          onDoubleClick={handlePreviewDoubleClick}
          className={`node-text-preview${text ? '' : ' node-text-preview--empty'}`}
          title={showLongTextHint ? '单击编辑文本，双击全屏编辑' : '单击编辑文本'}
        >
          {text || '粘贴/输入文本...'}
        </div>
      )}
      <div className="node-text-meta">
        <span>
          {showLongTextHint
            ? `${lineCount} 行 · ${text.length} 字符 · 双击可全屏编辑`
            : `${lineCount} 行 · ${text.length} 字符`}
        </span>
      </div>
      {isFullscreenEditing && (
        <LongTextEditorModal
          title="编辑文本输入"
          value={editor.value}
          onChange={(nextValue) => editor.onChange(nextValue)}
          onClose={() => setIsFullscreenEditing(false)}
          onCompositionStart={() => editor.onCompositionStart()}
          onCompositionEnd={(nextValue) => editor.onCompositionEnd(nextValue)}
        />
      )}
    </div>
  );
}
