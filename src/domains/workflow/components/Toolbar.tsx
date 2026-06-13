import type { WorkflowListItem } from '@/domains/workflow/lib/api';
import {
  AlignStartVertical,
  Copy,
  Download,
  Grid3x3,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Undo2,
  Upload,
  Workflow,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface ToolbarProps {
  workflowName: string;
  workflows: WorkflowListItem[];
  onWorkflowNameChange: (name: string) => void;
  onNewWorkflow: () => void;
  onOpenWorkflowLibrary: () => void;
  onDuplicateWorkflow: () => void;
  onDeleteWorkflow: () => void;
  onImportWorkflow: () => void;
  onExportWorkflow: () => void;
  onAutoArrange: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onExecute: () => void;
  onCancelExecution: () => void;
  onToggleRightPanel: () => void;
  rightPanelCollapsed: boolean;
  onToggleSnapToGrid: () => void;
  snapToGridEnabled: boolean;
  isExecuting: boolean;
  isSavingWorkflow: boolean;
  hasUnsavedChanges: boolean;
}

export default function Toolbar(props: ToolbarProps) {
  const {
    workflowName,
    workflows,
    onWorkflowNameChange,
    onNewWorkflow,
    onOpenWorkflowLibrary,
    onDuplicateWorkflow,
    onDeleteWorkflow,
    onImportWorkflow,
    onExportWorkflow,
    onAutoArrange,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onSave,
    onExecute,
    onCancelExecution,
    onToggleRightPanel,
    rightPanelCollapsed,
    onToggleSnapToGrid,
    snapToGridEnabled,
    isExecuting,
    isSavingWorkflow,
    hasUnsavedChanges,
  } = props;

  return (
    <>
      <div className="workflow-canvas-identity">
        <div className="workflow-toolbar__badge">
          <Workflow size={16} />
        </div>
        <div className="min-w-0">
          <div className="workflow-toolbar__eyebrow">Workflow Studio</div>
          <div className="workflow-toolbar__title">{workflowName || '未命名工作流'}</div>
        </div>
      </div>

      <div className="workflow-canvas-toolbar" aria-label="工作流工具">
        <div className="workflow-canvas-toolbar__trigger">
          <Wrench size={18} />
        </div>

        <div className="workflow-canvas-toolbar__content">
          <div className="workflow-toolbar__group workflow-toolbar__group--view">
            <ToolbarIconButton
              icon={rightPanelCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
              label={rightPanelCollapsed ? '展开结果栏' : '收起结果栏'}
              onClick={onToggleRightPanel}
            />
            <ToolbarIconButton
              icon={<Grid3x3 size={15} />}
              label={snapToGridEnabled ? '关闭网格吸附' : '开启网格吸附'}
              onClick={onToggleSnapToGrid}
              active={snapToGridEnabled}
            />
            <ToolbarIconButton icon={<AlignStartVertical size={15} />} label="自动整理" onClick={onAutoArrange} />
          </div>

          <div className="workflow-toolbar__divider" />

          <div className="workflow-toolbar__group workflow-toolbar__group--workflow">
            <button
              type="button"
              onClick={onOpenWorkflowLibrary}
              className="workflow-toolbar__library-button"
              data-testid="workflow-open-library"
              title="打开工作流库"
            >
              <Workflow size={14} />
              工作流库
              <span>{workflows.length}</span>
            </button>

            <input
              type="text"
              value={workflowName}
              onChange={(event) => onWorkflowNameChange(event.target.value)}
              className="workflow-toolbar__input"
              data-testid="workflow-name-input"
              placeholder="请输入工作流名称"
            />
          </div>

          <div className="workflow-toolbar__divider" />

          <div className="workflow-toolbar__group">
            <ToolbarIconButton icon={<Plus size={15} />} label="新建" onClick={onNewWorkflow} testId="workflow-new" />
            <ToolbarIconButton
              icon={<Copy size={15} />}
              label="另存为副本"
              onClick={onDuplicateWorkflow}
              testId="workflow-duplicate"
            />
            <ToolbarIconButton
              icon={<Trash2 size={15} />}
              label="删除"
              onClick={onDeleteWorkflow}
              testId="workflow-delete"
            />
            <ToolbarIconButton
              icon={<Upload size={15} />}
              label="导入"
              onClick={onImportWorkflow}
              testId="workflow-import"
            />
            <ToolbarIconButton
              icon={<Download size={15} />}
              label="导出"
              onClick={onExportWorkflow}
              testId="workflow-export"
            />
          </div>

          <div className="workflow-toolbar__divider" />

          <div className="workflow-toolbar__group">
            <ToolbarIconButton icon={<Undo2 size={15} />} label="撤销" onClick={onUndo} disabled={!canUndo} />
            <ToolbarIconButton icon={<Redo2 size={15} />} label="重做" onClick={onRedo} disabled={!canRedo} />
            <ToolbarIconButton
              icon={<Save size={15} />}
              label="保存"
              onClick={onSave}
              disabled={isSavingWorkflow}
              testId="workflow-save"
              active={hasUnsavedChanges}
            />
          </div>
        </div>
      </div>

      <div className="workflow-canvas-run-controls">
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

function ToolbarIconButton({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
  testId,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="workflow-toolbar__icon-button"
      style={{
        opacity: disabled ? 0.45 : 1,
        color: active
          ? 'var(--color-accent)'
          : disabled
            ? 'var(--color-text-quaternary)'
            : 'var(--color-text-secondary)',
        background: active ? 'rgba(10,132,255,0.12)' : 'transparent',
      }}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
