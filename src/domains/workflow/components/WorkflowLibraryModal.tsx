import type { WorkflowListItem } from '@/domains/workflow/lib/api';
import { CalendarClock, Edit3, FolderOpen, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type WorkflowLibraryModalProps = {
  workflows: WorkflowListItem[];
  activeWorkflowId: string;
  openDocumentWorkflowIds: string[];
  isBusy?: boolean;
  onClose: () => void;
  onOpenWorkflow: (workflowId: string) => void;
  onRenameWorkflow: (workflowId: string, name: string) => Promise<boolean>;
  onDeleteWorkflow: (workflowId: string) => Promise<boolean>;
};

function formatUpdatedAt(updatedAt: number) {
  if (!updatedAt) return '未知时间';
  return new Date(updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function WorkflowLibraryModal({
  workflows,
  activeWorkflowId,
  openDocumentWorkflowIds,
  isBusy = false,
  onClose,
  onOpenWorkflow,
  onRenameWorkflow,
  onDeleteWorkflow,
}: WorkflowLibraryModalProps) {
  const [query, setQuery] = useState('');
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pendingWorkflowId, setPendingWorkflowId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const openIds = useMemo(() => new Set(openDocumentWorkflowIds), [openDocumentWorkflowIds]);
  const filteredWorkflows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return workflows;
    return workflows.filter((workflow) => `${workflow.name} ${workflow.id}`.toLowerCase().includes(normalizedQuery));
  }, [query, workflows]);

  const startRename = (workflow: WorkflowListItem) => {
    setEditingWorkflowId(workflow.id);
    setDraftName(workflow.name);
    setErrorMessage('');
  };

  const commitRename = async (workflowId: string) => {
    const nextName = draftName.trim();
    if (!nextName) {
      setErrorMessage('工作流名称不能为空。');
      return;
    }

    setPendingWorkflowId(workflowId);
    const success = await onRenameWorkflow(workflowId, nextName);
    setPendingWorkflowId(null);
    if (!success) {
      setErrorMessage('重命名没有完成，请稍后重试。');
      return;
    }
    setEditingWorkflowId(null);
    setDraftName('');
    setErrorMessage('');
  };

  const deleteWorkflow = async (workflow: WorkflowListItem) => {
    const confirmed = window.confirm(`确定删除“${workflow.name}”吗？\n\n此操作会从工作流库中移除该记录，无法撤销。`);
    if (!confirmed) return;

    setPendingWorkflowId(workflow.id);
    const success = await onDeleteWorkflow(workflow.id);
    setPendingWorkflowId(null);
    if (!success) {
      setErrorMessage('删除没有完成，请稍后重试。');
      return;
    }
    setErrorMessage('');
  };

  return createPortal(
    <div
      className="workflow-library-modal"
      role="dialog"
      aria-modal="true"
      aria-label="工作流库"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="workflow-library-modal__dialog glass" onMouseDown={(event) => event.stopPropagation()}>
        <div className="workflow-library-modal__header">
          <div>
            <div className="workflow-library-modal__eyebrow">Workflow Library</div>
            <div className="workflow-library-modal__title">工作流库</div>
            <div className="workflow-library-modal__desc">管理已保存的工作流记录，打开后会进入独立标签页编辑。</div>
          </div>
          <button type="button" className="workflow-library-modal__close" onClick={onClose} aria-label="关闭工作流库">
            <X size={17} />
          </button>
        </div>

        <div className="workflow-library-modal__toolbar">
          <div className="workflow-library-modal__search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或 ID" />
          </div>
          <span className="workflow-library-modal__count">{workflows.length} 个已保存</span>
        </div>

        {errorMessage && <div className="workflow-library-modal__error">{errorMessage}</div>}

        <div className="workflow-library-modal__body" data-testid="workflow-library-modal">
          {filteredWorkflows.length === 0 ? (
            <div className="workflow-library-modal__empty">
              <FolderOpen size={22} />
              <strong>{workflows.length === 0 ? '还没有已保存工作流' : '没有匹配的工作流'}</strong>
              <span>{workflows.length === 0 ? '保存当前草稿后，这里会出现对应记录。' : '换一个关键词继续查找。'}</span>
            </div>
          ) : (
            filteredWorkflows.map((workflow) => {
              const isEditing = editingWorkflowId === workflow.id;
              const isPending = pendingWorkflowId === workflow.id || isBusy;
              const isOpen = openIds.has(workflow.id);
              const isActive = activeWorkflowId === workflow.id;

              return (
                <div
                  key={workflow.id}
                  className={`workflow-library-modal__row ${isActive ? 'workflow-library-modal__row--active' : ''}`}
                  data-testid={`workflow-library-row-${workflow.id}`}
                >
                  <div className="workflow-library-modal__main">
                    <div className="workflow-library-modal__name-line">
                      {isEditing ? (
                        <input
                          className="workflow-library-modal__rename-input"
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void commitRename(workflow.id);
                            if (event.key === 'Escape') {
                              setEditingWorkflowId(null);
                              setDraftName('');
                              setErrorMessage('');
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="workflow-library-modal__name-button"
                          onClick={() => onOpenWorkflow(workflow.id)}
                        >
                          {workflow.name || '未命名工作流'}
                        </button>
                      )}
                      {isActive && <span className="workflow-library-modal__tag">当前</span>}
                      {isOpen && !isActive && <span className="workflow-library-modal__tag">已打开</span>}
                    </div>
                    <div className="workflow-library-modal__meta">
                      <span>{workflow.nodeCount ?? 0} 个节点</span>
                      <span>
                        <CalendarClock size={12} />
                        {formatUpdatedAt(workflow.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="workflow-library-modal__actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="workflow-library-modal__action workflow-library-modal__action--primary"
                          disabled={isPending}
                          onClick={() => void commitRename(workflow.id)}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="workflow-library-modal__action"
                          disabled={isPending}
                          onClick={() => {
                            setEditingWorkflowId(null);
                            setDraftName('');
                            setErrorMessage('');
                          }}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="workflow-library-modal__icon-action"
                          disabled={isPending}
                          onClick={() => onOpenWorkflow(workflow.id)}
                          title="打开"
                          aria-label="打开"
                        >
                          <FolderOpen size={14} />
                        </button>
                        <button
                          type="button"
                          className="workflow-library-modal__icon-action"
                          disabled={isPending}
                          onClick={() => startRename(workflow)}
                          title="重命名"
                          aria-label="重命名"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="workflow-library-modal__icon-action workflow-library-modal__icon-action--danger"
                          disabled={isPending}
                          onClick={() => void deleteWorkflow(workflow)}
                          title="删除"
                          aria-label="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
