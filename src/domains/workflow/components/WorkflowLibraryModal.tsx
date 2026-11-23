import { DialogCloseButton, DialogHeader } from '@/ui/DialogPrimitives';
import { IconButton } from '@/ui/CanvasPrimitives';
import { Button, TextInput } from '@/ui/FormPrimitives';
import { useWorkflowConfirm } from '@/domains/workflow/components/WorkflowConfirmDialog';
import type { WorkflowListItem } from '@/domains/workflow/lib/api';
import { Badge, Eyebrow, PanelEmptyState } from '@/ui/PanelPrimitives';
import { StatusNotice } from '@/ui/FeedbackPrimitives';
import { SearchInput } from '@/ui/MenuPrimitives';
import { ModalSurface } from '@/ui/ModalSurface';
import { Copy, FolderOpen, MagnifyingGlass, NotePencil, ShareNetwork, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type WorkflowLibraryModalProps = {
  workflows: WorkflowListItem[];
  activeWorkflowId: string;
  openDocumentWorkflowIds: string[];
  isBusy?: boolean;
  theme?: 'dark' | 'light';
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
  theme,
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
        setCoverDarkness((prev) => ({
          ...prev,
          [cover]: sum / (32 * 32) < 140,
        }));
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
    <ModalSurface
      ariaLabel="工作流库"
      size="workspace"
      rootProps={theme ? { 'data-theme': theme } : undefined}
      rootClassName="workflow-library-modal"
      panelClassName="workflow-library-modal__panel"
      backdropLabel="点击背景关闭工作流库"
      onClose={onClose}
      isolateKeyboard
    >
      <DialogHeader
        className="modal-inset-panel"
        eyebrow="Workflow Library"
        title="工作流库"
        description="管理已保存的工作流记录，打开后会进入独立标签页编辑。"
        actions={<DialogCloseButton label="关闭工作流库" onClick={onClose} />}
      />

      <div className="workflow-library-modal__toolbar modal-inset-panel">
        <SearchInput
          className="workflow-library-modal__search"
          icon={<MagnifyingGlass size={14} />}
          aria-label="搜索工作流"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称或 ID"
        />
        <Badge>{workflows.length} 个已保存</Badge>
      </div>

      {errorMessage && (
        <StatusNotice tone="error" role="alert">
          {errorMessage}
        </StatusNotice>
      )}

      <section className="workflow-library-modal__content modal-inset-panel" aria-label="已保存的工作流">
        <div>
          <Eyebrow>工作流浏览</Eyebrow>
          <h3 className="workflow-library-modal__section-title">已保存的工作流</h3>
        </div>
        <div className="workflow-library-modal__body" data-testid="workflow-library-modal">
          {filteredWorkflows.length === 0 ? (
            <PanelEmptyState
              icon={<FolderOpen size={22} />}
              title={workflows.length === 0 ? '还没有已保存工作流' : '没有匹配的工作流'}
            >
              {workflows.length === 0 ? '保存当前草稿后，这里会出现对应记录。' : '换一个关键词继续查找。'}
            </PanelEmptyState>
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    {isEditing ? (
                      <TextInput
                        className="workflow-library-modal__rename-input"
                        aria-label="工作流名称"
                        value={draftName}
                        onChange={setDraftName}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation();
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
                      <Badge compact accent="var(--color-accent)">
                        当前
                      </Badge>
                    )}
                    {isOpen && !isActive && <Badge compact>已打开</Badge>}
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
                    <ShareNetwork size={48} weight="light" />
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
                          <Button
                            small
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void commitRename(workflow.id);
                            }}
                          >
                            保存
                          </Button>
                          <Button
                            small
                            variant="secondary"
                            className="ui-foreground-surface"
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingWorkflowId(null);
                              setDraftName('');
                              setErrorMessage('');
                            }}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <>
                          <IconButton
                            compact
                            className="ui-foreground-surface"
                            label="重命名"
                            icon={<NotePencil size={14} />}
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(workflow);
                            }}
                          />
                          <IconButton
                            compact
                            className="ui-foreground-surface"
                            label="复制"
                            icon={<Copy size={14} />}
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDuplicateWorkflow(workflow.id);
                            }}
                          />
                          <IconButton
                            compact
                            tone="danger"
                            className="ui-foreground-surface"
                            label="删除"
                            icon={<Trash size={14} />}
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteWorkflow(workflow);
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="workflow-library-modal__summary">共 {filteredWorkflows.length} 个匹配工作流</div>
      </section>
    </ModalSurface>,
    document.body,
  );
}
