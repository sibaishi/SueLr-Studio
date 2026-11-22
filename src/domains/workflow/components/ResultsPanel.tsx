import { ImagePreviewModal, type PreviewImageItem } from '@/domains/workflow/components/ImagePreviewModal';
import { useWorkflowConfirm } from '@/domains/workflow/components/WorkflowConfirmDialog';
import {
  type ExecutionHistoryEntry,
  fetchExecutionHistory,
  recoverExecutionVideo,
} from '@/domains/workflow/lib/api/execution';
import {
  type GeneratedOutputFile,
  clearGeneratedOutputs,
  fetchGeneratedOutputs,
} from '@/domains/workflow/lib/api/files';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { formatDurationSeconds, getExecutionStatusLabel } from '@/domains/workflow/lib/executionFormat';
import {
  type IoImageFileEntry,
  createIoImageFileEntryFromUrl,
  imageFileNameFromUrl,
  uploadIoImageFileEntry,
} from '@/domains/workflow/lib/ioImageFiles';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { Warning } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { backfillGenerationReferences, reuseGenerationParameters } from '../lib/generationActions';

import {
  LogsList,
  type PanelTab,
  ResultsList,
  ResultsPanelView,
  RunHistoryList,
  buildReadableLogs,
  formatLogsTabLabel,
} from './ResultsPresentation';

interface ResultsPanelProps {
  motionState?: 'entering' | 'leaving';
  onOpenSettings?: (module: 'connection' | 'models') => void;
}

export default function ResultsPanel({ motionState = 'entering', onOpenSettings }: ResultsPanelProps) {
  const confirm = useWorkflowConfirm();
  const [tab, setTab] = useState<PanelTab>('results');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [generatedOutputs, setGeneratedOutputs] = useState<GeneratedOutputFile[]>([]);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false);
  const [isClearingOutputs, setIsClearingOutputs] = useState(false);
  const [outputsError, setOutputsError] = useState<string | null>(null);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const executionLogs = useWorkflowStore((s) => s.executionLogs);
  const readableExecutionLogCount = useMemo(() => buildReadableLogs(executionLogs).length, [executionLogs]);
  const lastExecutionStatus = useWorkflowStore((s) => s.lastExecutionStatus);
  const lastExecutionTime = useWorkflowStore((s) => s.lastExecutionTime);
  const isExecuting = useWorkflowStore((s) => s.isExecuting);
  const workflowWarningMessage = useWorkflowStore((s) => s.workflowWarningMessage);
  const nodeWarnings = useWorkflowStore((s) => s.nodeWarnings);
  const clearExecutionLogs = useWorkflowStore((s) => s.clearExecutionLogs);
  const addNode = useWorkflowStore((s) => s.addNode);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const lastExecutionError = useWorkflowStore((s) => s.lastExecutionError);
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const isServerRuntime = false;

  const refreshGeneratedOutputs = useCallback(async () => {
    setIsLoadingOutputs(true);
    const result = await fetchGeneratedOutputs();
    setIsLoadingOutputs(false);
    if (result.success) {
      setGeneratedOutputs(result.data || []);
      setOutputsError(null);
      return;
    }
    setOutputsError(result.error || '读取生成文件失败');
  }, []);

  useEffect(() => {
    void refreshGeneratedOutputs();
  }, [refreshGeneratedOutputs, lastExecutionStatus]);

  useEffect(() => {
    if (!isExecuting) return;
    const timer = window.setInterval(() => {
      void refreshGeneratedOutputs();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isExecuting, refreshGeneratedOutputs]);

  const handleClearGeneratedOutputs = useCallback(async () => {
    const confirmed = await confirm({
      title: '清空历史输出？',
      message: '此操作会直接删除后端当前保留的临时输出文件，且无法撤回。',
      confirmText: '清空',
      cancelText: '取消',
      tone: 'danger',
    });
    if (!confirmed) return;

    setIsClearingOutputs(true);
    const result = await clearGeneratedOutputs();
    setIsClearingOutputs(false);

    if (!result.success) {
      setOutputsError(result.error || '清除服务器输出失败');
      return;
    }

    await refreshGeneratedOutputs();
  }, [confirm, refreshGeneratedOutputs]);

  const warningItems = useMemo(() => {
    return nodes
      .filter((node) => nodeWarnings[node.id])
      .map((node) => {
        const def = getNodeDef(node.type || '');
        return {
          id: node.id,
          label: def?.label || node.type || node.id,
          warning: nodeWarnings[node.id],
        };
      });
  }, [nodeWarnings, nodes]);

  const imageGallery = useMemo<PreviewImageItem[]>(() => {
    return generatedOutputs
      .filter((file) => file.type === 'image')
      .map((file) => ({
        src: file.url,
        thumbnailSrc: file.thumbnailUrl,
        name: file.name,
      }));
  }, [generatedOutputs]);
  const previewImageIndex = previewImage ? imageGallery.findIndex((item) => item.src === previewImage) : -1;

  const handleBackfillImageToCanvas = useCallback(
    async (image: PreviewImageItem) => {
      let entry: IoImageFileEntry;
      try {
        entry = await createIoImageFileEntryFromUrl(image.src, image.name || imageFileNameFromUrl(image.src));
      } catch (error) {
        console.warn('Failed to backfill image to IO node', error);
        return;
      }

      const nodeCount = nodes.length;
      const position = {
        x: 80 + (nodeCount % 6) * 34,
        y: 80 + Math.floor(nodeCount / 6) * 34,
      };
      const nodeId = addNode('io', position, {
        text: '',
        content: [entry.objectUrl],
        _fileIds: [entry.fileId],
        _fileKinds: ['image'],
        _fileOrder: [entry.fileId],
        _fileNames: [entry.fileName],
      });
      updateNodeData(nodeId, {
        content: [entry.objectUrl],
        _fileIds: [entry.fileId],
        _fileKinds: ['image'],
        _fileOrder: [entry.fileId],
        _fileNames: [entry.fileName],
      });
      uploadIoImageFileEntry(entry, (uploadedUrl, resultFileName) => {
        updateNodeData(nodeId, {
          content: [uploadedUrl],
          _fileNames: [resultFileName || entry.fileName],
        });
      });
      selectNode(nodeId);
      setPreviewImage(null);
    },
    [addNode, nodes.length, selectNode, updateNodeData],
  );

  return (
    <ResultsPanelView
      motionState={motionState}
      tab={tab}
      onTabChange={setTab}
      status={getExecutionStatusLabel(isExecuting, lastExecutionStatus)}
      duration={formatDurationSeconds(lastExecutionTime) || '还没有运行记录'}
      tone={isExecuting ? 'accent' : lastExecutionStatus === 'error' ? 'danger' : 'neutral'}
      logsLabel={formatLogsTabLabel(readableExecutionLogCount, executionLogs.length)}
    >
      {isServerRuntime && tab === 'results' && generatedOutputs.length > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            onClick={() => {
              void handleClearGeneratedOutputs();
            }}
            className="ui-panel-button"
            disabled={isClearingOutputs}
          >
            {isClearingOutputs ? '清除中...' : '清空服务器结果'}
          </button>
        </div>
      ) : null}

      <div className="workflow-panel__body workflow-results__body">
        {lastExecutionError && !workflowWarningMessage && (
          <div className="workflow-results__banner workflow-results__banner--warning" role="alert">
            <Warning size={14} />
            <span>{lastExecutionError}</span>
          </div>
        )}
        {workflowWarningMessage && (
          <div className="workflow-results__banner workflow-results__banner--warning" role="alert">
            <Warning size={14} />
            <span>{workflowWarningMessage}</span>
          </div>
        )}

        {warningItems.length > 0 && (
          <div className="ui-panel-card workflow-results__warning-list">
            <div className="workflow-results__section-title">启动前校验</div>
            {warningItems.map((item) => (
              <div key={item.id} className="workflow-results__warning-item">
                <span>{item.label}</span>
                <span>{item.warning}</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      onNodesChange(
                        nodes.map((node) => ({
                          id: node.id,
                          type: 'select',
                          selected: node.id === item.id,
                        })),
                      );
                      selectNode(item.id);
                    }}
                  >
                    选择节点
                  </button>
                  {onOpenSettings && (item.warning.includes('API Key') || item.warning.includes('连接')) && (
                    <button type="button" className="underline" onClick={() => onOpenSettings('connection')}>
                      配置连接
                    </button>
                  )}
                  {onOpenSettings && item.warning.includes('模型') && (
                    <button type="button" className="underline" onClick={() => onOpenSettings('models')}>
                      管理项目模型
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'history' ? (
          <RunHistory
            key={workflowId}
            workflowId={workflowId}
            isExecuting={isExecuting}
            onRecovered={() => void refreshGeneratedOutputs()}
          />
        ) : tab === 'results' ? (
          <ResultsList
            files={generatedOutputs}
            isLoading={isLoadingOutputs}
            error={outputsError}
            onPreviewImage={setPreviewImage}
            onReuseParameters={reuseGenerationParameters}
            onBackfillReferences={backfillGenerationReferences}
          />
        ) : (
          <LogsList logs={executionLogs} onClear={clearExecutionLogs} />
        )}
      </div>

      {previewImage && (
        <ImagePreviewModal
          src={previewImage}
          images={previewImageIndex >= 0 ? imageGallery : [{ src: previewImage }]}
          initialIndex={previewImageIndex >= 0 ? previewImageIndex : 0}
          onClose={() => setPreviewImage(null)}
          renderActions={(activeImage) => (
            <>
              <button
                type="button"
                className="workflow-image-preview-modal__action"
                onClick={() => {
                  void useWorkflowStore.getState().setWorkflowCover(activeImage.src);
                }}
              >
                设为封面
              </button>
              <button
                type="button"
                className="workflow-image-preview-modal__action"
                onClick={() => {
                  void handleBackfillImageToCanvas(activeImage);
                }}
              >
                填回到画板
              </button>
            </>
          )}
        />
      )}
    </ResultsPanelView>
  );
}

function RunHistory({
  workflowId,
  isExecuting,
  onRecovered,
}: {
  workflowId: string;
  isExecuting: boolean;
  onRecovered: () => void;
}) {
  const [entries, setEntries] = useState<ExecutionHistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [recovering, setRecovering] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState('');

  async function recover(runId: string, recoveryId: string) {
    setRecovering(recoveryId);
    setRecoveryError('');
    try {
      const result = await recoverExecutionVideo(runId, recoveryId);
      if (result.success) {
        setRefresh((value) => value + 1);
        onRecovered();
      } else {
        setRecoveryError(result.error || '视频取回失败。');
      }
    } finally {
      setRecovering(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetchExecutionHistory(workflowId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.success) {
        setEntries(result.data || []);
        setError('');
      } else {
        setError(result.error || '无法读取运行历史。');
      }
    });
    return () => controller.abort();
  }, [workflowId, isExecuting, refresh]);

  return (
    <RunHistoryList
      entries={entries}
      error={error}
      recoveryError={recoveryError}
      recovering={recovering}
      onRefresh={() => setRefresh((value) => value + 1)}
      onRecover={recover}
    />
  );
}
