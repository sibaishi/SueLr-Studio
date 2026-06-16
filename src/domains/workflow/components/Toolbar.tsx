import type { WorkflowListItem } from '@/domains/workflow/lib/api';
import { Play, Square, Workflow } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ToolbarProps {
  workflowName: string;
  workflows: WorkflowListItem[];
  onWorkflowNameSave: (name: string) => void;
  onOpenWorkflowLibrary: () => void;
  onExecute: () => void;
  onCancelExecution: () => void;
  rightPanelCollapsed: boolean;
  isExecuting: boolean;
}

export default function Toolbar({
  workflowName,
  workflows,
  onWorkflowNameSave,
  onOpenWorkflowLibrary,
  onExecute,
  onCancelExecution,
  rightPanelCollapsed,
  isExecuting,
}: ToolbarProps) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setDraftName(workflowName);
    setEditingName(true);
  }, [workflowName]);

  const commitEdit = useCallback(() => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== workflowName) {
      onWorkflowNameSave(trimmed);
    }
  }, [draftName, workflowName, onWorkflowNameSave]);

  const cancelEdit = useCallback(() => {
    setEditingName(false);
  }, []);

  useEffect(() => {
    if (editingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingName]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit();
      } else if (event.key === 'Escape') {
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit],
  );

  return (
    <>
      <div className="workflow-canvas-identity">
        <div className="workflow-toolbar__badge">
          <Workflow size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="workflow-toolbar__eyebrow">Workflow Studio</div>
          {editingName ? (
            <input
              ref={inputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="workflow-toolbar__title-input"
              placeholder="未命名工作流"
            />
          ) : (
            <button
              type="button"
              className="workflow-toolbar__title workflow-toolbar__title--editable"
              onClick={startEditing}
              title="点击编辑工作流名称"
            >
              {workflowName || '未命名工作流'}
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        className="workflow-library-fab"
        onClick={onOpenWorkflowLibrary}
        data-testid="workflow-open-library"
        title={`工作流库 · ${workflows.length}`}
        aria-label="打开工作流库"
      >
        <Workflow size={18} />
        {workflows.length > 0 && (
          <span className="workflow-library-fab__badge">{workflows.length}</span>
        )}
      </button>

      <div
        className={`workflow-canvas-run-controls ${
          rightPanelCollapsed ? '' : 'workflow-canvas-run-controls--with-results'
        }`}
      >
        <button
          type="button"
          onClick={onExecute}
          disabled={isExecuting}
          className="workflow-toolbar__primary-action"
          data-testid="workflow-execute"
        >
          <Play size={14} fill="currentColor" />
          执行
        </button>

        <button
          type="button"
          onClick={onCancelExecution}
          disabled={!isExecuting}
          className="workflow-toolbar__danger-action"
          data-testid="workflow-cancel-execution"
        >
          <Square size={13} fill="currentColor" />
          停止
        </button>
      </div>
    </>
  );
}
