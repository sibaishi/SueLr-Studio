import type { WorkflowListItem } from '@/domains/workflow/lib/api';
import { useWorkflowConfirm } from '@/domains/workflow/components/WorkflowConfirmDialog';
import {
  chipStyle,
  eyebrowStyle,
  mutedPanelStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/features/settings/components/styles';
import { Copy, Edit3, FolderOpen, Search, Trash2, Workflow, X } from 'lucide-react';
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
  onDuplicateWorkflow: (workflowId: string) => Promise<boolean>;
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
  onDuplicateWorkflow,
}: WorkflowLibraryModalProps) {
  const confirm = useWorkflowConfirm();
  const [query, setQuery] = useState('');
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pendingWorkflowId, setPendingWorkflowId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [coverDarkness, setCoverDarkness] = useState<Record<string, boolean>>({});
  const openIds = useMemo(() => new Set(openDocumentWorkflowIds), [openDocumentWorkflowIds]);

  /* precompute cover luminance so text color adapts to image brightness */
  useMemo(() => {
    for (const w of workflows) {
      const cover = w.coverUrl;
      if (!cover || coverDarkness[cover] !== undefined) continue;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 32);
        const d = ctx.getImageData(0, 0, 32, 32).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        setCoverDarkness((prev) => ({ ...prev, [cover]: sum / (32 * 32) < 140 }));
      };
      img.onerror = () => setCoverDarkness((prev) => ({ ...prev, [cover]: false }));
      img.src = cover;
      setCoverDarkness((prev) => ({ ...prev, [cover]: false })); // placeholder
    }
  }, [workflows]);
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
    const confirmed = await confirm({
      title: `删除"${workflow.name}"？`,
      message: '此操作会从工作流库中移除该记录，无法撤销。',
      confirmText: '删除',
      cancelText: '取消',
      tone: 'danger',
    });
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
      <div
        style={{
          ...panelStyle(),
          display: 'flex',
          flexDirection: 'column',
          width: 'min(880px, 100%)',
          maxHeight: 'min(86vh, 860px)',
          overflow: 'hidden',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="workflow-library-modal__header">
          <div>
            <div style={eyebrowStyle()}>Workflow Library</div>
            <h2 style={{ ...sectionTitleStyle(), marginTop: 6 }}>工作流库</h2>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', margin: '7px 0 0' }}>
              管理已保存的工作流记录，打开后会进入独立标签页编辑。
            </p>
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
          <span style={{ ...chipStyle(), height: 40, padding: '0 14px', fontSize: 12, fontWeight: 700 }}>
            {workflows.length} 个已保存
          </span>
        </div>

        {errorMessage && <div className="workflow-library-modal__error">{errorMessage}</div>}

        <div className="workflow-library-modal__body" data-testid="workflow-library-modal">
          {filteredWorkflows.length === 0 ? (
            <div
              style={{
                ...mutedPanelStyle(),
                width: '100%',
                minHeight: 220,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 24,
                color: 'var(--color-text-secondary)',
                textAlign: 'center',
              }}
            >
              <FolderOpen size={22} />
              <strong style={{ color: 'var(--color-text-primary)', fontSize: 14 }}>
                {workflows.length === 0 ? '还没有已保存工作流' : '没有匹配的工作流'}
              </strong>
              <span style={{ fontSize: 12 }}>
                {workflows.length === 0 ? '保存当前草稿后，这里会出现对应记录。' : '换一个关键词继续查找。'}
              </span>
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
                  className={`workflow-library-modal__card${isActive ? ' workflow-library-modal__card--active' : ''}`}
                  data-testid={`workflow-library-row-${workflow.id}`}
                  title={`${workflow.nodeCount ?? 0} 个节点 · ${formatUpdatedAt(workflow.updatedAt)} 创建`}
                  style={{
                    ...(workflow.coverUrl
                      ? {
                          backgroundImage: `url(${workflow.coverUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          color: coverDarkness[workflow.coverUrl] ? '#fff' : '#0f0f0f',
                          textShadow: coverDarkness[workflow.coverUrl]
                            ? '0 1px 4px rgba(0,0,0,0.6)'
                            : '0 1px 2px rgba(255,255,255,0.4)',
                        }
                      : {}),
                  }}
                  onClick={() => onOpenWorkflow(workflow.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
                        className="workflow-library-modal__card-name"
                        onClick={() => onOpenWorkflow(workflow.id)}
                      >
                        {workflow.name || '未命名工作流'}
                      </button>
                    )}
                    {isActive && (
                      <span style={{ ...chipStyle('var(--color-accent)'), fontSize: 10, padding: '3px 6px' }}>
                        当前
                      </span>
                    )}
                    {isOpen && !isActive && (
                      <span style={{ ...chipStyle(), fontSize: 10, padding: '3px 6px' }}>已打开</span>
                    )}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: workflow.coverUrl ? 0 : 0.16,
                    }}
                  >
                    <Workflow size={48} strokeWidth={1.5} />
                  </div>

                  <div
                    style={{
                      paddingTop: 8,
                      background: workflow.coverUrl
                        ? `linear-gradient(transparent, ${coverDarkness[workflow.coverUrl] ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.25)'})`
                        : 'transparent',
                      borderRadius: workflow.coverUrl ? '0 0 20px 20px' : 0,
                    }}
                  >
                    <div className="workflow-library-modal__card-actions" style={{ marginTop: 0 }}>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="workflow-library-modal__action workflow-library-modal__action--primary"
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void commitRename(workflow.id);
                            }}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="workflow-library-modal__action"
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
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
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(workflow);
                            }}
                            title="重命名"
                            aria-label="重命名"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            className="workflow-library-modal__icon-action"
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDuplicateWorkflow(workflow.id);
                            }}
                            title="复制"
                            aria-label="复制"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            className="workflow-library-modal__icon-action workflow-library-modal__icon-action--danger"
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteWorkflow(workflow);
                            }}
                            title="删除"
                            aria-label="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
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
