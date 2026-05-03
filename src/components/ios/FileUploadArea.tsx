import { useState, useRef, type DragEvent } from 'react';
import { Folder } from 'lucide-react';
import { useT } from '../../contexts/ThemeContext';

export function FileUploadArea({ onUpload, accept = 'image/*', multiple = true, disabled = false }: { onUpload: (files: File[]) => void; accept?: string; multiple?: boolean; disabled?: boolean }) {
  const T = useT();
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); if (!disabled && e.dataTransfer.files.length) onUpload(Array.from(e.dataTransfer.files)); };
  return (
    <div onClick={() => { if (!disabled) inputRef.current?.click(); }} onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={handleDrop}
      style={{ border: `1px dashed ${drag ? T.blue : T.border}`, borderRadius: 16, padding: '18px 12px', textAlign: 'center', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s', background: drag ? `${T.blue}10` : 'var(--color-bg-secondary)', opacity: disabled ? 0.55 : 1 }}>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={e => { if (e.target.files && !disabled) onUpload(Array.from(e.target.files)); e.target.value = ''; }} style={{ display: 'none' }} />
      <Folder size={20} color={T.text3} style={{ margin: '0 auto 6px' }} />
      <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.6 }}>
        {disabled ? '该功能暂时停用，请先启用对应能力后再上传文件。' : '点击或拖拽文件到此处'}
      </div>
    </div>
  );
}
