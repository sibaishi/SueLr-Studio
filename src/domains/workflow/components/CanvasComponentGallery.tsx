import { SettingsGallery } from '@/features/settings/components/SettingsGallery';
import { ToastProvider } from '@/providers/ToastContext';
import { AssetLibraryView } from './AssetLibraryModal';
import { createGalleryAssetSource } from './galleryAssetSource';
import type { WorkflowListItem } from '@/domains/workflow/lib/api/workflows';
import WorkflowExportModal from './WorkflowExportModal';
import WorkflowImportReportModal from './WorkflowImportReportModal';
import WorkflowLibraryModal from './WorkflowLibraryModal';
import { WorkflowConfirmProvider } from './WorkflowConfirmDialog';
import { NODE_REGISTRY } from '@/domains/workflow/lib/constants';
import { getCollapsedGroupNodeSize } from '@/domains/workflow/lib/groupLayout';
import { ResolvedThemeContext } from '@/providers/ThemeContext';
import {
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { CanvasGalleryInspector, CanvasGalleryTools } from './CanvasGalleryInspector';
import CanvasNavigation from './CanvasNavigation';
import FloatingToolbar from './FloatingToolbar';
import { GridDots } from './GridDots';
import { GridGlow } from './GridGlow';
import { ImagePreviewModal } from './ImagePreviewModal';
import StatusBar from './StatusBar';
import Toolbar from './Toolbar';
import { CanvasContextMenu, CanvasNodeCatalog, ContextMenuButton } from './flowCanvasCatalog';
import { getContextMenuLayout, isPaneBackgroundTarget } from './flowCanvasUiHelpers';
import {
  GalleryActions,
  type GalleryData,
  type GalleryNode,
  galleryImage,
  galleryNodeTypes,
} from './WorkflowGalleryNode';
import WorkflowGalleryPanel from './WorkflowGalleryPanel';
import {
  GalleryAgentPanel,
  type GalleryPanelScenario,
  GalleryResultsPanel,
  type GallerySidePanel,
} from './WorkflowGallerySidePanels';
import '../index.css';

const galleryCatalog = NODE_REGISTRY.filter((node) => node.type === 'ai' || node.type === 'io');
type GalleryMenu =
  | { kind: 'catalog'; position: { x: number; y: number } }
  | { kind: 'paneActions' | 'node'; x: number; y: number; position: { x: number; y: number }; nodeId?: string };

const initialDocuments = [
  { documentId: 'draft', name: '基础图生图', hasUnsavedChanges: true, isExecuting: false },
  { documentId: 'running', name: '批量图片处理', hasUnsavedChanges: false, isExecuting: true },
  { documentId: 'long', name: '这是一个用于检查长标题截断的工作流标签', hasUnsavedChanges: false, isExecuting: false },
];
const initialSavedWorkflows: WorkflowListItem[] = initialDocuments.map(({ documentId, name }) => ({
  id: documentId,
  name,
  nodeCount: 4,
  updatedAt: 0,
}));

const initialNodes: GalleryNode[] = [
  {
    id: 'group',
    type: 'gallery',
    position: { x: 0, y: 0 },
    width: 1040,
    height: 416,
    data: { kind: 'group', title: '基础图生图 · 组件演示', content: 'empty', text: '' },
  },
  ...(['reference', 'model', 'output'] as const).map(
    (id, index): GalleryNode => ({
      id,
      type: 'gallery',
      parentId: 'group',
      extent: 'parent',
      position: { x: 32 + index * 348, y: 84 },
      width: 280,
      height: 280,
      selected: id === 'model',
      data: {
        kind: id === 'model' ? 'ai' : 'io',
        title: id === 'reference' ? '参考输入' : id === 'model' ? 'AI 图像生成' : '输出预览',
        content: id === 'model' ? 'empty' : 'image',
        text: '保留参考图主体细节，使用明亮、清晰的画面。',
        status: 'idle',
      },
    }),
  ),
];
const initialEdges: Edge[] = [
  { id: 'reference-model', source: 'reference', target: 'model', sourceHandle: 'result', targetHandle: 'input' },
  { id: 'model-output', source: 'model', target: 'output', sourceHandle: 'result', targetHandle: 'input' },
];
const fitOptions = { padding: { top: '108px', right: '108px', bottom: '336px', left: '108px' }, maxZoom: 1 } as const;

function VirtualCanvas({
  theme,
  onThemeChange,
  onSetTheme,
  onReset,
}: {
  theme: 'dark' | 'light';
  onThemeChange: () => void;
  onSetTheme: (theme: 'dark' | 'light') => void;
  onReset: () => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<GalleryNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const flow = useReactFlow<GalleryNode>();
  const [sidePanel, setSidePanel] = useState<GallerySidePanel>(null);
  const [scenario, setScenario] = useState<GalleryPanelScenario>('content');
  const [agentFloating, setAgentFloating] = useState(false);
  const docked = sidePanel !== null && !(sidePanel === 'agent' && agentFloating);
  const [executing, setExecuting] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [grid, setGrid] = useState(true);
  const [inspector, setInspector] = useState(false);
  const [documents, setDocuments] = useState(initialDocuments);
  const [activeId, setActiveId] = useState('draft');
  const [galleryAssetSource] = useState(createGalleryAssetSource);
  const [savedWorkflows, setSavedWorkflows] = useState(initialSavedWorkflows);
  const [workflowDialog, setWorkflowDialog] = useState<'library' | 'assets' | 'settings' | 'import' | 'export' | null>(null);
  const [emptyModels, setEmptyModels] = useState(false);
  const [inputState, setInputState] = useState('editable');
  const [menu, setMenu] = useState<GalleryMenu | null>(null);
  const [clipboard, setClipboard] = useState<GalleryData | null>(null);
  const [preview, setPreview] = useState<GalleryData | null>(null);
  const [message, setMessage] = useState('点击节点编辑内容；拖动画布、节点或小地图，检查实际组合效果。');
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pointer, setPointer] = useState<{ screen: { x: number; y: number }; flow: { x: number; y: number } } | null>(
    null,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const serial = useRef(0);
  const selected = nodes.find((node) => node.selected && !node.hidden);
  const patch = (data: Partial<GalleryData>) => {
    if (selected) flow.updateNodeData(selected.id, data);
  };
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const collapse = (id: string) =>
    setNodes((current) => {
      const group = current.find((node) => node.id === id);
      if (!group) return current;
      const collapsed = !group.data.collapsed;
      return current.map((node) =>
        node.id === id
          ? {
              ...node,
              selected: true,
              ...(collapsed ? getCollapsedGroupNodeSize({ data: {} }) : { width: 1040, height: 416 }),
              data: { ...node.data, collapsed },
            }
          : node.parentId === id
            ? { ...node, hidden: collapsed, selected: false }
            : { ...node, selected: false },
      );
    });
  const duplicate = (id: string) =>
    setNodes((current) => {
      const source = current.find((node) => node.id === id);
      if (!source || source.data.kind === 'group') return current;
      const parent = current.find((node) => node.id === source.parentId);
      const copy: GalleryNode = {
        ...source,
        id: `copy-${++serial.current}`,
        parentId: undefined,
        extent: undefined,
        position: {
          x: source.position.x + (parent?.position.x || 0) + 48,
          y: source.position.y + (parent?.position.y || 0) + 464,
        },
        selected: true,
        data: { ...source.data, title: `${source.data.title} 副本` },
      };
      setMessage('已复制示例节点，可拖动查看。');
      return [...current.map((node) => ({ ...node, selected: false })), copy];
    });
  const addGalleryNode = (position: { x: number; y: number }, data: GalleryData) => {
    const id = `added-${++serial.current}`;
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { id, type: 'gallery', position, width: 280, height: 280, selected: true, data },
    ]);
    setMenu(null);
  };
  const openCatalog = (x: number, y: number) => {
    setMenu({ kind: 'catalog', position: flow.screenToFlowPosition({ x, y }) });
  };
  const openContextMenu = (event: MouseEvent | ReactMouseEvent, nodeId?: string) => {
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    if (nodeId) setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
    const kind = nodeId ? 'node' : 'paneActions';
    const { x, y } = getContextMenuLayout(kind, stage, event.clientX - rect.left, event.clientY - rect.top);
    setMenu({ kind, nodeId, x, y, position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) });
  };
  const contextNode = menu?.kind === 'node' ? nodes.find((node) => node.id === menu.nodeId) : undefined;
  const run = (running: boolean) => {
    setExecuting(running);
    setNodes((current) =>
      current.map((node) =>
        node.data.kind === 'ai' && !node.data.disabled
          ? {
              ...node,
              data: { ...node.data, status: running ? 'running' : 'idle' },
            }
          : node,
      ),
    );
    setMessage(running ? '正在演示运行状态，不发送模型请求。点击停止结束演示。' : '已停止演示。');
  };
  const hiddenIds = new Set(nodes.filter((node) => node.hidden).map((node) => node.id));
  const renderedNodes = nodes.map((node) => ({
    ...node,
    draggable: !node.data.locked && !nodes.find((parent) => parent.id === node.parentId)?.data.locked,
  }));
  return (
    <GalleryActions.Provider value={{ notify: setMessage, preview: setPreview, collapse, duplicate }}>
      <div className="canvas-gallery-workspace" data-side-panel={sidePanel !== null || undefined}>
        <div
          className="canvas-gallery-stage"
          ref={stageRef}
          onClickCapture={(event) => {
            if (!(event.target instanceof Element) || !event.target.closest('.workflow-context-menu')) setMenu(null);
          }}
          onDoubleClick={(event) => {
            if (event.button === 0 && isPaneBackgroundTarget(event.target)) openCatalog(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPointer({
              screen: { x: event.clientX - rect.left, y: event.clientY - rect.top },
              flow: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            });
          }}
          onPointerLeave={() => setPointer(null)}
        >
          {grid && (
            <>
              <GridDots
                gap={28}
                size={1.5}
                hoverSize={2}
                color="var(--color-grid-dot)"
                glowColor="var(--canvas-grid-glow)"
                glowRadius={112}
                containerWidth={size.width}
                containerHeight={size.height}
                mouseFlowPos={pointer?.flow || null}
                fadeOut={pointer ? 0 : 1}
              />
              <GridGlow
                radius={112}
                containerWidth={size.width}
                containerHeight={size.height}
                mouseScreenPos={pointer?.screen || null}
                fadeOut={pointer ? 0 : 1}
              />
            </>
          )}
          <div className={`workflow-flow-area ${docked ? 'workflow-flow-area--with-results' : ''}`}>
            <ReactFlow
              nodes={renderedNodes}
              edges={edges.map((edge) => ({
                ...edge,
                hidden: hiddenIds.has(edge.source) || hiddenIds.has(edge.target),
              }))}
              nodeTypes={galleryNodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(connection) => setEdges((current) => addEdge(connection, current))}
              onNodeContextMenu={(event, node) => openContextMenu(event, node.id)}
              onPaneContextMenu={(event) => openContextMenu(event, selected?.id)}
              onNodeClick={(_, node) => setMessage(`已选中「${node.data.title}」。`)}
              fitView
              fitViewOptions={fitOptions}
              minZoom={0.2}
              maxZoom={1.5}
              zoomOnDoubleClick={false}
              snapToGrid={snapping}
              snapGrid={[12, 12]}
              deleteKeyCode={null}
              aria-label="组件虚拟画布"
            >
              <CanvasNavigation
                nodeColor={(node) =>
                  node.data.kind === 'ai' ? '#0a84ff' : node.data.kind === 'group' ? '#64748b' : '#8b5cf6'
                }
              />
            </ReactFlow>
          </div>
          <Toolbar
            workflowName={documents.find((document) => document.documentId === activeId)?.name || '组件示例'}
            workflows={savedWorkflows}
            onWorkflowNameSave={(name) =>
              setDocuments((current) =>
                current.map((document) =>
                  document.documentId === activeId ? { ...document, name, hasUnsavedChanges: true } : document,
                ),
              )
            }
            onOpenWorkflowLibrary={() => setWorkflowDialog('library')}
            isExecuting={executing}
            rightPanelCollapsed={!docked}
            onExecute={() => run(true)}
            onCancelExecution={() => run(false)}
          />
          <FloatingToolbar
            themeMode={theme}
            onToggleTheme={onThemeChange}
            onAddNode={() => {
              const rect = stageRef.current?.getBoundingClientRect();
              if (rect) openCatalog(rect.left + rect.width / 2, rect.top + rect.height / 2);
            }}
            onOpenAssetLibrary={() => setWorkflowDialog('assets')}
            onOpenSettings={() => setWorkflowDialog('settings')}
            onToggleRightPanel={() => {
              setSidePanel(sidePanel === 'results' ? null : 'results');
              setAgentFloating(false);
            }}
            rightPanelCollapsed={sidePanel !== 'results'}
            onToggleAgent={() => {
              setSidePanel(sidePanel === 'agent' ? null : 'agent');
              setAgentFloating(false);
            }}
            agentOpen={sidePanel === 'agent'}
            onToggleSnapToGrid={() => setSnapping((current) => !current)}
            snapToGridEnabled={snapping}
            onAutoArrange={() => {
              setNodes((current) =>
                current.map((node) => {
                  const initial = initialNodes.find((item) => item.id === node.id);
                  return initial ? { ...node, position: initial.position } : node;
                }),
              );
              void flow.fitView(fitOptions);
              setMessage('已恢复示例节点布局。');
            }}
          />
          {sidePanel === 'results' && (
            <GalleryResultsPanel
              key={scenario}
              scenario={scenario}
              notify={setMessage}
              onPreview={() => setPreview({ kind: 'io', title: '结果图像演示', content: 'image', text: '' })}
            />
          )}
          {sidePanel === 'agent' && (
            <GalleryAgentPanel
              key={scenario}
              scenario={scenario}
              notify={setMessage}
              onClose={() => {
                setSidePanel(null);
                setAgentFloating(false);
              }}
              floating={agentFloating}
              onFloatingChange={setAgentFloating}
            />
          )}
          <StatusBar
            documents={documents}
            activeDocumentId={activeId}
            onSelectDocument={(id) => {
              setActiveId(id);
              setMessage('已切换标签外观；同一组组件示例保持不变。');
            }}
            onCloseDocument={(id) => {
              const remaining = documents.filter((document) => document.documentId !== id);
              setDocuments(remaining);
              if (id === activeId) setActiveId(remaining[0]?.documentId || '');
            }}
            onNewWorkflow={() => {
              const documentId = `document-${++serial.current}`;
              setDocuments((current) => [
                ...current,
                { documentId, name: '未命名示例', hasUnsavedChanges: true, isExecuting: false },
              ]);
              setActiveId(documentId);
            }}
            onDuplicateWorkflow={() => {
              const documentId = `document-${++serial.current}`;
              const source = documents.find((document) => document.documentId === activeId);
              setDocuments((current) => [
                ...current,
                { documentId, name: `${source?.name || '组件示例'} 副本`, hasUnsavedChanges: true, isExecuting: false },
              ]);
              setActiveId(documentId);
            }}
            onDeleteWorkflow={() => {
              const remaining = documents.filter((document) => document.documentId !== activeId);
              setDocuments(remaining);
              setActiveId(remaining[0]?.documentId || '');
              setMessage('已移除演示标签，可重置恢复。');
            }}
            onImportWorkflow={() => {
              const documentId = `document-${++serial.current}`;
              setDocuments((current) => [
                ...current,
                { documentId, name: '导入演示', hasUnsavedChanges: true, isExecuting: false },
              ]);
              setActiveId(documentId);
              setWorkflowDialog('import');
            }}
            onExportWorkflow={() => setWorkflowDialog('export')}
            onUndo={() => {}}
            onRedo={() => {}}
            canUndo={false}
            canRedo={false}
            onSave={() => {
              setDocuments((current) =>
                current.map((document) =>
                  document.documentId === activeId ? { ...document, hasUnsavedChanges: false } : document,
                ),
              );
              const active = documents.find((document) => document.documentId === activeId);
              if (active) {
                setSavedWorkflows((current) => [
                  ...current.filter((workflow) => workflow.id !== activeId),
                  { id: activeId, name: active.name, nodeCount: nodes.length, updatedAt: Date.now() },
                ]);
              }
              setMessage('演示工作流已保存到示例库。');
            }}
            isSavingWorkflow={false}
            hasUnsavedChanges={Boolean(
              documents.find((document) => document.documentId === activeId)?.hasUnsavedChanges,
            )}
          />
          {selected && selected.data.kind !== 'group' && (
            <div
              className={`workflow-flow-area canvas-gallery-editor-area ${docked ? 'workflow-flow-area--with-results' : ''}`}
            >
              <WorkflowGalleryPanel
                key={selected.id}
                node={selected}
                emptyModels={emptyModels}
                inputState={inputState}
                onTextChange={(text) => patch({ text })}
                notify={setMessage}
              />
            </div>
          )}
          {menu?.kind === 'catalog' && (
            <CanvasNodeCatalog
              nodeDefs={galleryCatalog}
              onDismiss={() => setMenu(null)}
              onChoose={(kind) => {
                const definition = galleryCatalog.find((node) => node.type === kind);
                if (!definition || (kind !== 'ai' && kind !== 'io')) return;
                addGalleryNode(menu.position, {
                  kind,
                  title: definition.label,
                  content: 'empty',
                  text: '',
                  status: 'idle',
                });
              }}
            />
          )}
          {menu && menu.kind !== 'catalog' && (
            <CanvasContextMenu
              key={contextNode?.id ?? 'pane-actions'}
              x={menu.x}
              y={menu.y}
              label={contextNode ? '节点右键菜单' : '画布右键菜单'}
              onDismiss={() => setMenu(null)}
            >
              {contextNode ? (
                <>
                  <ContextMenuButton
                    label={contextNode.data.kind === 'group' ? '复制节点组' : '复制节点'}
                    onClick={() => {
                      setClipboard(contextNode.data);
                      setMenu(null);
                    }}
                    disabled={contextNode.data.kind === 'group'}
                    title={contextNode.data.kind === 'group' ? '演示仅支持复制 AI 和 IO 节点' : undefined}
                  />
                  <ContextMenuButton
                    label={contextNode.data.locked ? '解锁' : '锁定'}
                    onClick={() => {
                      flow.updateNodeData(contextNode.id, { locked: !contextNode.data.locked });
                      setMenu(null);
                    }}
                  />
                  <ContextMenuButton
                    label={contextNode.data.disabled ? '启用' : '禁用'}
                    onClick={() => {
                      flow.updateNodeData(contextNode.id, { disabled: !contextNode.data.disabled });
                      setMenu(null);
                    }}
                  />
                  {contextNode.data.kind !== 'group' && (
                    <ContextMenuButton
                      label="删除节点"
                      danger
                      onClick={() => {
                        void flow.deleteElements({ nodes: [{ id: contextNode.id }] });
                        setMenu(null);
                      }}
                    />
                  )}
                </>
              ) : (
                <ContextMenuButton
                  label="粘贴节点"
                  disabled={!clipboard}
                  title={!clipboard ? '剪贴板里还没有可粘贴的节点' : undefined}
                  onClick={() => {
                    if (clipboard) addGalleryNode(menu.position, { ...clipboard });
                  }}
                />
              )}
            </CanvasContextMenu>
          )}
        </div>
        {inspector && (
          <CanvasGalleryInspector
            nodes={nodes}
            selected={selected}
            message={message}
            inputState={inputState}
            emptyModels={emptyModels}
            grid={grid}
            sidePanel={sidePanel}
            scenario={scenario}
            onSidePanelChange={(panel) => {
              setSidePanel(panel);
              setAgentFloating(false);
            }}
            onScenarioChange={(next) => {
              setScenario(next);
              setAgentFloating(false);
            }}
            onClose={() => setInspector(false)}
            onSelect={(id) => setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })))}
            patch={patch}
            collapse={collapse}
            onInputStateChange={setInputState}
            onEmptyModelsChange={setEmptyModels}
            onGridChange={setGrid}
            onFit={() => void flow.fitView(fitOptions)}
            onReset={onReset}
          />
        )}
      </div>
      <div className="sr-only" role="status">
        {message}
      </div>
      {workflowDialog === 'library' && (
        <WorkflowLibraryModal
          theme={theme}
          workflows={savedWorkflows}
          activeWorkflowId={activeId}
          openDocumentWorkflowIds={documents.map(({ documentId }) => documentId)}
          onClose={() => setWorkflowDialog(null)}
          onOpenWorkflow={(id) => {
            const workflow = savedWorkflows.find((item) => item.id === id);
            if (!workflow) return;
            setDocuments((current) => current.some(({ documentId }) => documentId === id)
              ? current
              : [...current, { documentId: id, name: workflow.name, hasUnsavedChanges: false, isExecuting: false }]);
            setActiveId(id);
            setWorkflowDialog(null);
          }}
          onRenameWorkflow={async (id, name) => {
            setSavedWorkflows((current) => current.map((item) => item.id === id ? { ...item, name } : item));
            setDocuments((current) => current.map((item) => item.documentId === id ? { ...item, name } : item));
            return true;
          }}
          onDeleteWorkflow={async (id) => {
            const remaining = documents.filter(({ documentId }) => documentId !== id);
            setSavedWorkflows((current) => current.filter((item) => item.id !== id));
            setDocuments(remaining);
            if (activeId === id) setActiveId(remaining[0]?.documentId || '');
            return true;
          }}
          onDuplicateWorkflow={async (id) => {
            const workflow = savedWorkflows.find((item) => item.id === id);
            if (!workflow) return false;
            const copy = { ...workflow, id: `document-${++serial.current}`, name: `${workflow.name} 副本` };
            setSavedWorkflows((current) => [...current, copy]);
            return true;
          }}
        />
      )}
      <SettingsGallery open={workflowDialog === 'settings'} theme={theme} onSetTheme={onSetTheme}
        onClose={() => setWorkflowDialog(null)} />
      {workflowDialog === 'assets' && (
        <AssetLibraryView
          theme={theme}
          sourceApi={galleryAssetSource}
          onClose={() => setWorkflowDialog(null)}
          onBackfill={async (asset) => {
            const content = asset.type === 'data' || asset.type === 'file' ? 'text' : asset.type;
            const text = content === 'text' ? await (await fetch(asset.url)).text() : '';
            const bounds = stageRef.current?.getBoundingClientRect();
            addGalleryNode(flow.screenToFlowPosition({
              x: (bounds?.left || 0) + size.width / 2,
              y: (bounds?.top || 0) + size.height / 2,
            }), { kind: 'io', title: asset.name, content, text, src: asset.url, status: 'idle' });
          }}
        />
      )}
      {workflowDialog === 'import' && (
        <WorkflowImportReportModal
          fileName="导入演示.json"
          report={{
            sourceVersion: 1,
            targetVersion: 1,
            appliedMigrations: [],
            warnings: ['示例报告：参考素材需要重新选择。'],
            rejectedFields: [],
            result: 'imported_with_warnings',
          }}
          onClose={() => setWorkflowDialog(null)}
        />
      )}
      {workflowDialog === 'export' && (
        <WorkflowExportModal
          references={['演示参考图.png']}
          busy={false}
          error=""
          onClose={() => setWorkflowDialog(null)}
          onDownload={(withMedia) => {
            setMessage(withMedia ? '已选择带素材导出 ZIP。' : '已选择仅导出 JSON。');
            setWorkflowDialog(null);
          }}
        />
      )}
      {preview && (
        <ImagePreviewModal
          theme={theme}
          src={preview.content === 'image' ? preview.src || galleryImage : ''}
          textContent={preview.content === 'text' ? preview.text : undefined}
          title={preview.title}
          showEditActions={preview.content === 'image'}
          onSaveBoardImage={async () => setMessage('已更新演示预览。')}
          onExportLayer={async () => setMessage('图层已导出演示，项目文件未写入。')}
          onClose={() => setPreview(null)}
        />
      )}
      <CanvasGalleryTools
        theme={theme}
        docked={sidePanel !== null}
        inspector={inspector}
        onThemeChange={onThemeChange}
        onToggleInspector={() => setInspector(!inspector)}
        onReset={onReset}
      />
    </GalleryActions.Provider>
  );
}

/** Development-only entry: fixture state is isolated from project state and persistence. */
export default function CanvasComponentGallery() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [revision, setRevision] = useState(0);
  return (
    <ResolvedThemeContext.Provider value={theme}>
      <main data-theme={theme} className="workflow-page canvas-gallery-page" aria-label="画布组件库">
        <ReactFlowProvider key={revision}>
          <ToastProvider>
          <WorkflowConfirmProvider theme={theme}>
            <VirtualCanvas
              theme={theme}
              onSetTheme={setTheme}
              onThemeChange={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              onReset={() => setRevision((current) => current + 1)}
            />
          </WorkflowConfirmProvider>
          </ToastProvider>
        </ReactFlowProvider>
      </main>
    </ResolvedThemeContext.Provider>
  );
}
