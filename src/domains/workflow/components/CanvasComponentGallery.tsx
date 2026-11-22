import { DARK, LIGHT } from '@/app/theme/constants';
import { getCollapsedGroupNodeSize } from '@/domains/workflow/lib/groupLayout';
import { TCtx } from '@/providers/ThemeContext';
import {
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { CanvasGalleryInspector, CanvasGalleryTools } from './CanvasGalleryInspector';
import CanvasNavigation from './CanvasNavigation';
import FloatingToolbar from './FloatingToolbar';
import { GridDots } from './GridDots';
import { GridGlow } from './GridGlow';
import { ImagePreviewModal } from './ImagePreviewModal';
import StatusBar from './StatusBar';
import Toolbar from './Toolbar';
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

const initialDocuments = [
  { documentId: 'draft', name: '基础图生图', hasUnsavedChanges: true, isExecuting: false },
  { documentId: 'running', name: '批量图片处理', hasUnsavedChanges: false, isExecuting: true },
  { documentId: 'long', name: '这是一个用于检查长标题截断的工作流标签', hasUnsavedChanges: false, isExecuting: false },
];
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
  onReset,
}: {
  theme: 'dark' | 'light';
  onThemeChange: () => void;
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
  const [emptyModels, setEmptyModels] = useState(false);
  const [inputState, setInputState] = useState('editable');
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
              onNodeClick={(_, node) => setMessage(`已选中「${node.data.title}」。`)}
              fitView
              fitViewOptions={fitOptions}
              minZoom={0.2}
              maxZoom={1.5}
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
            workflows={documents.map((document) => ({
              id: document.documentId,
              name: document.name,
              nodeCount: initialNodes.length,
              updatedAt: 0,
            }))}
            onWorkflowNameSave={(name) =>
              setDocuments((current) =>
                current.map((document) =>
                  document.documentId === activeId ? { ...document, name, hasUnsavedChanges: true } : document,
                ),
              )
            }
            onOpenWorkflowLibrary={() => setMessage('工作流库入口演示，未读取项目工作流。')}
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
              const position = flow.screenToFlowPosition({
                x: (rect?.left || 0) + size.width / 2,
                y: (rect?.top || 0) + size.height / 2,
              });
              setNodes((current) => [
                ...current.map((node) => ({ ...node, selected: false })),
                {
                  id: `added-${++serial.current}`,
                  type: 'gallery',
                  position,
                  width: 280,
                  height: 280,
                  selected: true,
                  data: { kind: 'io', title: '新增 IO', content: 'empty', text: '', status: 'idle' },
                },
              ]);
            }}
            onOpenAssetLibrary={() => setMessage('资产库入口演示，不读取本地文件或资产。')}
            onOpenSettings={() => setMessage('设置入口演示，不修改用户设置。')}
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
            onImportWorkflow={() => setMessage('导入按钮演示，不打开文件。')}
            onExportWorkflow={() => setMessage('导出按钮演示，不写入文件。')}
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
              setMessage('已清除当前标签的未保存标记，不保存项目。');
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
      {preview && (
        <ImagePreviewModal
          theme={theme}
          src={preview.content === 'image' ? galleryImage : ''}
          textContent={preview.content === 'text' ? preview.text : undefined}
          title={preview.title}
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
    <TCtx.Provider value={theme === 'dark' ? DARK : LIGHT}>
      <main data-theme={theme} className="workflow-page canvas-gallery-page" aria-label="画布组件库">
        <ReactFlowProvider key={revision}>
          <VirtualCanvas
            theme={theme}
            onThemeChange={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            onReset={() => setRevision((current) => current + 1)}
          />
        </ReactFlowProvider>
      </main>
    </TCtx.Provider>
  );
}
