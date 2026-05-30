import type { WorkflowListItem } from '@/domains/workflow/lib/api';
import {
  AlignStartVertical,
  Copy,
  Download,
  Grid3x3,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Save,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface ToolbarProps {
  workflowName: string;
  workflows: WorkflowListItem[];
  onWorkflowNameChange: (name: string) => void;
  onNewWorkflow: () => void;
  onOpenWorkflowLibrary: () => void;
  onOpenAssistant: () => void;
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
  onSettings: () => void;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  onToggleSnapToGrid: () => void;
  snapToGridEnabled: boolean;
  isExecuting: boolean;
  isSavingWorkflow: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  executionMessage?: string;
  executionProgress?: { current: number; total: number };
  executingNodeLabel?: string;
}

function formatSaveStatus(isSavingWorkflow: boolean, hasUnsavedChanges: boolean, lastSavedAt: number | null) {
  if (isSavingWorkflow) return '保存中...';
  if (hasUnsavedChanges) return '有未保存修改';
  if (!lastSavedAt) return '未保存草稿';
  return '已保存';
}

function getSaveStatusTone(isSavingWorkflow: boolean, hasUnsavedChanges: boolean, lastSavedAt: number | null) {
  if (isSavingWorkflow) return 'saving';
  if (hasUnsavedChanges) return 'dirty';
  if (!lastSavedAt) return 'draft';
  return 'saved';
}

export default function Toolbar(props: ToolbarProps) {
  const {
    workflowName,
    workflows,
    onWorkflowNameChange,
    onNewWorkflow,
    onOpenWorkflowLibrary,
    onOpenAssistant,
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
    onSettings,
    onToggleLeftPanel,
    onToggleRightPanel,
    leftPanelCollapsed,
    rightPanelCollapsed,
    onToggleSnapToGrid,
    snapToGridEnabled,
    isExecuting,
    isSavingWorkflow,
    hasUnsavedChanges,
    lastSavedAt,
    executionMessage,
    executionProgress,
    executingNodeLabel,
  } = props;

  const saveStatus = formatSaveStatus(isSavingWorkflow, hasUnsavedChanges, lastSavedAt);
  const saveStatusTone = getSaveStatusTone(isSavingWorkflow, hasUnsavedChanges, lastSavedAt);

  return (
    <div className="workflow-toolbar glass">
      <div className="workflow-toolbar__frame">
        <div className="workflow-toolbar__identity">
          <div className="workflow-toolbar__badge">
            <Workflow size={16} />
          </div>
          <div className="min-w-0">
            <div className="workflow-toolbar__eyebrow">Workflow Studio</div>
            <div className="workflow-toolbar__title">{workflowName || '未命名工作流'}</div>
          </div>
        </div>

        <div className="workflow-toolbar__group workflow-toolbar__group--library">
          <ToolbarIconButton
            icon={leftPanelCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            label={leftPanelCollapsed ? '展开节点库' : '收起节点库'}
            onClick={onToggleLeftPanel}
          />
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

        <div className="workflow-toolbar__group workflow-toolbar__group--assistant">
          <ToolbarIconButton
            icon={<Sparkles size={15} />}
            label="AI 助手"
            onClick={onOpenAssistant}
            testId="workflow-ai-assistant"
          />
        </div>

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

        <div className="workflow-toolbar__group">
          <ToolbarIconButton icon={<Undo2 size={15} />} label="撤销" onClick={onUndo} disabled={!canUndo} />
          <ToolbarIconButton icon={<Redo2 size={15} />} label="重做" onClick={onRedo} disabled={!canRedo} />
          <ToolbarIconButton
            icon={<Save size={15} />}
            label="保存"
            onClick={onSave}
            disabled={isSavingWorkflow}
            testId="workflow-save"
          />
        </div>

        <div className="workflow-toolbar__status">
          <div className={`workflow-toolbar__status-chip workflow-toolbar__status-chip--${saveStatusTone}`}>
            {saveStatus}
          </div>
          {isExecuting && (
            <div className="workflow-toolbar__progress">
              <div className="workflow-toolbar__progress-copy">
                {executingNodeLabel ? `运行到：${executingNodeLabel}` : executionMessage || '执行中...'}
              </div>
              {executionProgress && (
                <div className="workflow-toolbar__progress-track">
                  <div
                    className="workflow-toolbar__progress-bar"
                    style={{ width: `${(executionProgress.current / executionProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="workflow-toolbar__group workflow-toolbar__group--actions">
          <button onClick={onExecute} disabled={isExecuting} className="workflow-toolbar__primary-action">
            <Play size={14} fill="currentColor" />
            执行
          </button>

          <button onClick={onCancelExecution} disabled={!isExecuting} className="workflow-toolbar__danger-action">
            <Square size={13} fill="currentColor" />
            停止
          </button>

          <ToolbarIconButton
            icon={<Settings2 size={15} />}
            label="设置"
            onClick={onSettings}
            testId="workflow-open-settings"
          />
        </div>
      </div>
    </div>
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
