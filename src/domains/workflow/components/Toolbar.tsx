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
  Square,
  Trash2,
  Undo2,
  Upload,
  Workflow,
} from 'lucide-react';
import { type ReactNode, useMemo } from 'react';

interface ToolbarProps {
  workflowId: string;
  workflowName: string;
  workflows: WorkflowListItem[];
  onWorkflowNameChange: (name: string) => void;
  onNewWorkflow: () => void;
  onSelectWorkflow: (workflowId: string) => void;
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
  if (!lastSavedAt) return '仅本地草稿';

  const time = new Date(lastSavedAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `已保存于 ${time}`;
}

function getSaveStatusTone(isSavingWorkflow: boolean, hasUnsavedChanges: boolean, lastSavedAt: number | null) {
  if (isSavingWorkflow) return 'saving';
  if (hasUnsavedChanges) return 'dirty';
  if (!lastSavedAt) return 'draft';
  return 'saved';
}

export default function Toolbar(props: ToolbarProps) {
  const {
    workflowId,
    workflowName,
    workflows,
    onWorkflowNameChange,
    onNewWorkflow,
    onSelectWorkflow,
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

  const currentWorkflowValue = useMemo(() => {
    return workflows.some((workflow) => workflow.id === workflowId) ? workflowId : '';
  }, [workflowId, workflows]);

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
            <div className="workflow-toolbar__title">{workflowName || '当前工作流还没有名称'}</div>
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

        <div className="workflow-toolbar__group workflow-toolbar__group--workflow">
          <select
            value={currentWorkflowValue}
            onChange={(e) => onSelectWorkflow(e.target.value)}
            className="workflow-toolbar__select"
          >
            <option value="">当前工作流未保存</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={workflowName}
            onChange={(e) => onWorkflowNameChange(e.target.value)}
            className="workflow-toolbar__input"
            data-testid="workflow-name-input"
            placeholder="请输入工作流名称"
          />
        </div>

        <div className="workflow-toolbar__group">
          <ToolbarIconButton icon={<Plus size={15} />} label="新建" onClick={onNewWorkflow} testId="workflow-new" />
          <ToolbarIconButton
            icon={<Copy size={15} />}
            label="复制"
            onClick={onDuplicateWorkflow}
            testId="workflow-duplicate"
          />
          <ToolbarIconButton
            icon={<Trash2 size={15} />}
            label="删除"
            onClick={onDeleteWorkflow}
            testId="workflow-delete"
          />
          <ToolbarIconButton icon={<Upload size={15} />} label="导入" onClick={onImportWorkflow} testId="workflow-import" />
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
