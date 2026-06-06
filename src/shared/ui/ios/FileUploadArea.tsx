import { useT } from '@/providers/ThemeContext';
import { Folder } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';

export function FileUploadArea({
  onUpload,
  accept = 'image/*',
  multiple = true,
  disabled = false,
}: {
  onUpload: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const T = useT();
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDrag(false);
    if (!disabled && event.dataTransfer.files.length) onUpload(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      style={{
        border: `1px dashed ${drag ? T.blue : T.border}`,
        borderRadius: 'var(--radius-lg)',
        padding: '18px 12px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease',
        background: drag ? `${T.blue}10` : 'var(--color-bg-secondary)',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files && !disabled) onUpload(Array.from(event.target.files));
          event.target.value = '';
        }}
        style={{ display: 'none' }}
      />
      <Folder size={20} color={T.text3} style={{ margin: '0 auto 6px' }} />
      <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.6 }}>
        {disabled ? '功能暂时不可用，请先启用对应能力后再上传文件。' : '点击或拖拽文件到此处'}
      </div>
    </div>
  );
}
