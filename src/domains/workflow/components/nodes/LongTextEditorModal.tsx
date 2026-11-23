import { TextComposer } from '@/ui/TextComposer';
import { DialogCloseButton, DialogHeader } from '@/ui/DialogPrimitives';
import './long-text-editor.css';
import { ModalSurface } from '@/ui/ModalSurface';
import {
  isolateWorkflowModalKey,
  stopWorkflowModalEvent,
  useWorkflowModalIsolation,
  workflowModalPointerBoundary,
} from '../workflowModalIsolation';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const segmentRefs = useRef<Array<HTMLTextAreaElement | null>>([]);

  useWorkflowModalIsolation(dialogRef, () => editorRef.current ?? segmentRefs.current[0]);

  useEffect(() => {
    segmentRefs.current.forEach((textarea) => {
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }, [segments]);

  return createPortal(
    <ModalSurface
      ariaLabel={title}
      onClose={onClose}
      size="workspace"
      rootClassName="long-text-editor-modal"
      panelClassName="long-text-editor-modal__dialog"
      panelRef={dialogRef}
      manageFocus={false}
      closeOnEscape={false}
      dialogOnPanel
      rootProps={{
        ...workflowModalPointerBoundary,
        'data-workflow-modal-overlay': '',
        onClick: stopWorkflowModalEvent,
        onMouseDown: stopWorkflowModalEvent,
      }}
      panelProps={{
        onKeyPress: stopWorkflowModalEvent,
        onPaste: stopWorkflowModalEvent,
        onKeyUp: stopWorkflowModalEvent,
        onKeyDown: (event) => {
          isolateWorkflowModalKey(event);
          if (event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onClose();
          }
        },
      }}
    >
      <DialogHeader
        className="long-text-editor-modal__header"
        title={title}
        actions={<DialogCloseButton label={readOnly ? '关闭全屏查看' : '关闭全屏编辑'} onClick={onClose} />}
      />
      {segments ? (
        <div className="long-text-editor-modal__segments">
          {segments.map((segment, index) => (
            <section key={`segment-${index + 1}`} className="long-text-editor-modal__segment">
              <label className="long-text-editor-modal__segment-title" htmlFor={`segment-editor-${index + 1}`}>
                片段 {index + 1}
              </label>
              <TextComposer
                label={`片段 ${index + 1}`}
                className="long-text-editor-modal__segment-composer"
                textareaProps={{
                  id: `segment-editor-${index + 1}`,
                  ref: (element) => {
                    segmentRefs.current[index] = element;
                  },
                  value: segment,
                  placeholder: '输入片段内容...',
                  readOnly: readOnly || !onSegmentsChange,
                  onChange: (event) => {
                    const nextSegments = [...segments];
                    nextSegments[index] = event.target.value;
                    event.currentTarget.style.height = 'auto';
                    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                    onSegmentsChange?.(nextSegments);
                  },
                  onCompositionStart,
                  onCompositionEnd: (event) => {
                    const nextSegments = [...segments];
                    nextSegments[index] = event.currentTarget.value;
                    onSegmentsChange?.(nextSegments);
                    onCompositionEnd?.(event.currentTarget.value);
                  },
                }}
              />
            </section>
          ))}
        </div>
      ) : (
        <TextComposer
          label={title}
          className="long-text-editor-modal__textarea"
          textareaProps={{
            ref: editorRef,
            value,
            placeholder,
            readOnly,
            onChange: (event) => onChange(event.target.value),
            onCompositionStart,
            onCompositionEnd: (event) => onCompositionEnd?.(event.currentTarget.value),
          }}
        />
      )}
      <div className="long-text-editor-modal__meta">
        {segments
          ? `${segments.length} 段 · ${segments.reduce((total, segment) => total + segment.length, 0)} 字符`
          : `${value ? value.split(/\r\n|\r|\n/).length : 0} 行 · ${value.length} 字符`}
      </div>
    </ModalSurface>,
    document.body,
  );
}
