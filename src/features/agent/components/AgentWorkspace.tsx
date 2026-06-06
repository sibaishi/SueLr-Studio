import {
  type AgentPendingApproval,
  type AgentPlan,
  type AgentRunResponse,
  type WorkflowApplyDraftResult,
  type WorkflowCanvasSummary,
  type WorkflowDraftResponse,
  type WorkflowEditPatch,
  type WorkflowEditResult,
  type WorkflowExecuteResult,
  type WorkflowInspectResult,
  type WorkflowSuggestedInput,
  createAgentRun,
} from '@/domains/workflow/lib/api';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import type { ModelInfo } from '@/shared/types';
import type { Edge, Node } from '@xyflow/react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  Maximize2,
  Play,
  Send,
  Settings2,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

type AgentToolName =
  | 'agent.plan'
  | 'chat.respond'
  | 'workflow.inspect'
  | 'workflow.edit'
  | 'workflow.applyDraft'
  | 'workflow.createDraft'
  | 'workflow.execute'
  | 'workflow.diagnose'
  | 'workflow.summarizeRun'
  | 'image.generate'
  | 'image.edit'
  | 'image.compare'
  | 'video.generate'
  | 'copy.write'
  | 'prompt.optimize'
  | 'result.inspect'
  | 'asset.package';

type AgentToolRecord = {
  id: string;
  name: AgentToolName;
  label: string;
  status: 'running' | 'success' | 'error';
  summary: string;
  detail?: string;
};

type AgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  plan?: AgentPlan;
  draft?: WorkflowDraftResponse;
  inspectResult?: WorkflowCanvasSummary | null;
  workflowEditPatch?: WorkflowEditPatch | null;
  workflowSuggestedInputs?: WorkflowSuggestedInput[];
  toolRecords?: AgentToolRecord[];
  pendingApproval?: AgentPendingApproval;
  approvalInput?: string;
  approvalValues?: Record<string, string>;
};

interface AgentWorkspaceProps {
  open: boolean;
  onClose: () => void;
  onOpenWorkflow: () => void;
  plannerModels: ModelInfo[];
  imageModels: ModelInfo[];
  videoModels: ModelInfo[];
}

const STARTER_PROMPT = '例如：帮我为一个新上市的保温杯设计一套电商主图工作流，并生成可编辑画布';
const PLANNER_MODEL_STORAGE_KEY = 'suelr_agent_planner_model';
const IMAGE_MODEL_STORAGE_KEY = 'suelr_agent_image_model';
const VIDEO_MODEL_STORAGE_KEY = 'suelr_agent_video_model';

function gid(prefix = 'agent') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function getDraftSummary(draft: WorkflowDraftResponse) {
  const nodeCount = draft.workflow.nodes.length;
  const edgeCount = draft.workflow.edges.length;
  return `已完成一个可编辑的工作流草案：${draft.workflow.name}。它包含 ${nodeCount} 个节点、${edgeCount} 条连线。`;
}

function getAgentResultSummary(plan: AgentPlan, draft: WorkflowDraftResponse) {
  const prefix =
    plan.source === 'llm' || draft.architect?.used ? '已根据当前需求生成工作流草案' : '已生成基础工作流草案';
  const suffix = draft.validation.valid ? '你可以打开画布检查并继续编辑。' : '草案还需要进一步调整后再使用。';
  return `${prefix}。${getDraftSummary(draft)}${suffix}`;
}

function getWorkflowToolRecord(draft: WorkflowDraftResponse): AgentToolRecord {
  const plannerLabel = draft.agentContext?.plannerModel?.label;
  return {
    id: gid('tool'),
    name: 'workflow.createDraft',
    label: '工作流工具',
    status: draft.validation.valid ? 'success' : 'error',
    summary: draft.validation.valid ? '已生成可编辑工作流草案' : '草案生成完成，但校验未通过',
    detail: [
      plannerLabel ? `Planner：${plannerLabel}` : '',
      `${draft.workflow.nodes.length} 个节点，${draft.workflow.edges.length} 条连线`,
    ]
      .filter(Boolean)
      .join('；'),
  };
}

function getPlannerToolRecord(plan: AgentPlan): AgentToolRecord {
  return {
    id: gid('tool'),
    name: 'agent.plan',
    label: 'Planner',
    status: 'success',
    summary: plan.summary,
    detail: [`模型：${plan.plannerModel.label || plan.plannerModel.modelId}`].filter(Boolean).join('；'),
  };
}

const PRODUCTION_TOOL_LABELS: Record<string, string> = {
  'image.generate': '生成图片',
  'image.edit': '编辑图片',
  'image.compare': '图片对比',
  'video.generate': '生成视频',
  'copy.write': '生成文案',
  'prompt.optimize': '优化提示词',
  'result.inspect': '检查结果',
  'asset.package': '打包资源',
};

const WORKFLOW_TOOL_LABELS: Record<string, string> = {
  'workflow.inspect': '检查工作流',
  'workflow.edit': '修改草案',
  'workflow.applyDraft': '应用修改',
  'workflow.execute': '运行工作流',
  'workflow.diagnose': '诊断运行',
};

function getToolLabel(toolName: string): string {
  if (PRODUCTION_TOOL_LABELS[toolName]) return PRODUCTION_TOOL_LABELS[toolName];
  if (toolName.startsWith('workflow.')) return WORKFLOW_TOOL_LABELS[toolName] || '工作流工具';
  return '运行工具';
}

function getChatToolRecord(plan: AgentPlan): AgentToolRecord {
  return {
    id: gid('tool'),
    name: 'chat.respond',
    label: '对话',
    status: 'success',
    summary: plan.summary || '已按普通对话回复',
  };
}

function getAgentToolRecord(plan: AgentPlan, response?: string): AgentToolRecord {
  return {
    id: gid('tool'),
    name: plan.toolName,
    label: getToolLabel(plan.toolName),
    status: 'success',
    summary: response || plan.summary,
    detail: plan.reasoningSummary,
  };
}

function getPlannerModelLabel(model: ModelInfo) {
  return `${model.modelId || model.id}${model.configName ? ` · ${model.configName}` : ''}`;
}

function buildPlannerModelPayload(model: ModelInfo | null) {
  if (!model) return undefined;
  return {
    id: model.id,
    modelId: model.modelId || model.id,
    configId: model.configId,
    configName: model.configName,
    label: getPlannerModelLabel(model),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isWorkflowCanvasSummary(value: unknown): value is WorkflowCanvasSummary {
  const record = asRecord(value);
  return Boolean(
    record && typeof record.id === 'string' && typeof record.name === 'string' && typeof record.signature === 'string',
  );
}

function isWorkflowEditPatch(value: unknown): value is WorkflowEditPatch {
  const record = asRecord(value);
  return Boolean(
    record && typeof record.id === 'string' && typeof record.workflowId === 'string' && asRecord(record.workflow),
  );
}

function isWorkflowSuggestedInput(value: unknown): value is WorkflowSuggestedInput {
  const record = asRecord(value);
  return Boolean(
    record &&
      typeof record.nodeId === 'string' &&
      typeof record.nodeType === 'string' &&
      typeof record.label === 'string' &&
      Array.isArray(record.aliases),
  );
}

function getPrimaryToolOutput(runResult: AgentRunResponse) {
  return asRecord(runResult.toolResults[0]?.output);
}

function getToolOutput(runResult: AgentRunResponse, skillId: string) {
  return asRecord(runResult.toolResults.find((result) => result.skillId === skillId)?.output);
}

function stringifyApprovalValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getWorkflowSuggestedInputs(value: unknown): WorkflowSuggestedInput[] {
  return Array.isArray(value) ? value.filter(isWorkflowSuggestedInput) : [];
}

function getInitialApprovalValues(inputs: unknown, suggestedInputs: WorkflowSuggestedInput[]) {
  const values = asRecord(inputs) || {};
  return suggestedInputs.reduce<Record<string, string>>((acc, item) => {
    const matchedValue = [item.nodeId, ...item.aliases]
      .map((key) => values[key])
      .find(
        (candidate) =>
          candidate !== undefined && candidate !== null && stringifyApprovalValue(candidate).trim().length > 0,
      );
    acc[item.nodeId] = matchedValue === undefined ? '' : stringifyApprovalValue(matchedValue);
    return acc;
  }, {});
}

function buildApprovalInputPayload(values?: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(values || {})) {
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
  }
  return next;
}

function getApprovalInputPlaceholder(input: WorkflowSuggestedInput) {
  if (input.kind === 'text') return '填写本次运行的文本输入，留空则继续使用已保存默认值';
  if (input.kind === 'image') return '填写图片 URL 或本地路径，留空则继续使用当前素材';
  if (input.kind === 'video') return '填写视频 URL 或本地路径，留空则继续使用当前素材';
  if (input.kind === 'audio') return '填写音频 URL 或本地路径，留空则继续使用当前素材';
  return '填写蒙版 URL 或本地路径，留空则继续使用当前素材';
}

export default function AgentWorkspace({ open, onClose, onOpenWorkflow, plannerModels, imageModels, videoModels }: AgentWorkspaceProps) {
  const [input, setInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [expandedTools, setExpandedTools] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedPlannerModelId, setSelectedPlannerModelId] = useState(
    () => localStorage.getItem(PLANNER_MODEL_STORAGE_KEY) || '',
  );
  const [selectedImageModelId, setSelectedImageModelId] = useState(
    () => localStorage.getItem(IMAGE_MODEL_STORAGE_KEY) || '',
  );
  const [selectedVideoModelId, setSelectedVideoModelId] = useState(
    () => localStorage.getItem(VIDEO_MODEL_STORAGE_KEY) || '',
  );
  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    {
      id: gid(),
      role: 'assistant',
      content:
        '我是项目 Agent。你可以直接描述想完成的事，我会根据需求生成可编辑的工作流草案，并把结果交给你继续检查和调整。',
    },
  ]);
  const workflowContext = useWorkflowStore(
    useShallow((state) => ({
      workflowId:
        state.documents.find((document) => document.documentId === state.activeDocumentId)?.sourceWorkflowId || '',
      workflowName: state.workflowName,
      runId: state.lastExecutionRunId || '',
    })),
  );

  const selectedPlannerModel = useMemo(
    () => plannerModels.find((model) => model.id === selectedPlannerModelId) || plannerModels[0] || null,
    [plannerModels, selectedPlannerModelId],
  );
  const selectedImageModel = useMemo(
    () => imageModels.find((model) => model.id === selectedImageModelId) || imageModels[0] || null,
    [imageModels, selectedImageModelId],
  );
  const selectedVideoModel = useMemo(
    () => videoModels.find((model) => model.id === selectedVideoModelId) || videoModels[0] || null,
    [videoModels, selectedVideoModelId],
  );
  const hasPlannerModel = Boolean(selectedPlannerModel);
  const canSubmit = input.trim().length > 0 && !isWorking && hasPlannerModel;
  const latestDraft = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].draft) return messages[index].draft;
    }
    return null;
  }, [messages]);
  const latestWorkflowEditPatch = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].workflowEditPatch) return messages[index].workflowEditPatch;
    }
    return null;
  }, [messages]);
  const hasUserStartedConversation = useMemo(() => messages.some((message) => message.role === 'user'), [messages]);
  const latestPendingApproval = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].pendingApproval) return messages[index].pendingApproval;
    }
    return null;
  }, [messages]);
  const activeCanvasLabel = workflowContext.workflowName.trim() || '当前未关联画布';
  const latestDeliverableLabel = latestWorkflowEditPatch ? '修改草案' : latestDraft ? '工作流草案' : '暂无';
  const workspaceStatus = !hasPlannerModel
    ? '等待可用模型'
    : isWorking
      ? '正在处理新任务'
      : latestPendingApproval
        ? latestPendingApproval.toolName === 'workflow.applyDraft'
          ? '等待确认应用修改'
          : '等待确认运行工作流'
        : latestWorkflowEditPatch
          ? '已生成修改草案'
          : latestDraft
            ? '已生成工作流草案'
            : '可以开始协作';
  const workspaceStatusTone = !hasPlannerModel
    ? 'muted'
    : isWorking
      ? 'accent'
      : latestPendingApproval
        ? 'warning'
        : latestWorkflowEditPatch || latestDraft
          ? 'success'
          : 'muted';
  const conversationCount = Math.max(messages.length - 1, 0);

  useEffect(() => {
    if (plannerModels.length === 0) {
      if (selectedPlannerModelId) setSelectedPlannerModelId('');
      localStorage.removeItem(PLANNER_MODEL_STORAGE_KEY);
      return;
    }

    const hasSelected = plannerModels.some((model) => model.id === selectedPlannerModelId);
    if (hasSelected) return;

    const nextId = plannerModels[0].id;
    setSelectedPlannerModelId(nextId);
    localStorage.setItem(PLANNER_MODEL_STORAGE_KEY, nextId);
  }, [plannerModels, selectedPlannerModelId]);

  useEffect(() => {
    if (imageModels.length === 0) {
      if (selectedImageModelId) setSelectedImageModelId('');
      localStorage.removeItem(IMAGE_MODEL_STORAGE_KEY);
      return;
    }
    const hasSelected = imageModels.some((model) => model.id === selectedImageModelId);
    if (hasSelected) return;
    const nextId = imageModels[0].id;
    setSelectedImageModelId(nextId);
    localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, nextId);
  }, [imageModels, selectedImageModelId]);

  useEffect(() => {
    if (videoModels.length === 0) {
      if (selectedVideoModelId) setSelectedVideoModelId('');
      localStorage.removeItem(VIDEO_MODEL_STORAGE_KEY);
      return;
    }
    const hasSelected = videoModels.some((model) => model.id === selectedVideoModelId);
    if (hasSelected) return;
    const nextId = videoModels[0].id;
    setSelectedVideoModelId(nextId);
    localStorage.setItem(VIDEO_MODEL_STORAGE_KEY, nextId);
  }, [videoModels, selectedVideoModelId]);

  if (!open) return null;

  const toggleToolRecord = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const applyWorkflowDraft = (draft: WorkflowDraftResponse) => {
    const workflowStore = useWorkflowStore.getState();
    workflowStore.createWorkflowDocument({ origin: 'new', name: draft.workflow.name });
    workflowStore.applyEditorSnapshot(
      {
        workflowId: draft.workflow.id,
        workflowName: draft.workflow.name,
        nodes: draft.workflow.nodes as Node[],
        edges: draft.workflow.edges as Edge[],
        selectedNodeId: null,
      },
      true,
    );
    workflowStore.persistLocalDraft();
    onOpenWorkflow();
    onClose();
  };

  const applyWorkflowSnapshot = (workflow: { id: string; name: string; nodes: unknown[]; edges: unknown[] }) => {
    const workflowStore = useWorkflowStore.getState();
    workflowStore.applyEditorSnapshot(
      {
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodes: workflow.nodes as Node[],
        edges: workflow.edges as Edge[],
        selectedNodeId: null,
      },
      true,
    );
    workflowStore.persistLocalDraft();
    onOpenWorkflow();
  };

  const getWorkflowSnapshot = () => {
    const workflowStore = useWorkflowStore.getState();
    return workflowStore.exportCurrentWorkflow();
  };

  const buildAgentContext = (workflowEditPatch?: WorkflowEditPatch | null) => {
    const workflowSnapshot = getWorkflowSnapshot();
    return {
      ...(workflowContext.workflowId ? { workflowId: workflowContext.workflowId } : {}),
      ...(workflowContext.workflowName ? { workflowName: workflowContext.workflowName } : {}),
      ...(workflowContext.runId ? { runId: workflowContext.runId } : {}),
      ...(workflowSnapshot ? { workflowSnapshot } : {}),
      ...(workflowEditPatch || latestWorkflowEditPatch
        ? { workflowEditPatch: workflowEditPatch || latestWorkflowEditPatch }
        : {}),
    };
  };

  const appendAgentResult = (runResult: AgentRunResponse, task: string) => {
    const { plan, response, workflowDraft: draft, pendingApproval } = runResult;
    const output = getPrimaryToolOutput(runResult);
    const inspectResult = asRecord(output) as WorkflowInspectResult | null;
    const editResult = asRecord(output) as WorkflowEditResult | null;
    const applyResult = asRecord(output) as WorkflowApplyDraftResult | null;
    const executeResult = getToolOutput(runResult, 'workflow.execute') as WorkflowExecuteResult | null;
    if (executeResult?.run?.runId) {
      useWorkflowStore.setState((state) => ({
        currentRunId: null,
        lastExecutionRunId: executeResult.run?.runId || state.lastExecutionRunId,
        lastExecutionStatus: executeResult.run?.status === 'completed' ? 'success' : 'error',
        lastExecutionError: executeResult.run?.status === 'completed' ? null : executeResult.run?.summary || null,
      }));
    }
    if (pendingApproval) {
      const workflowSuggestedInputs =
        pendingApproval.toolName === 'workflow.execute'
          ? getWorkflowSuggestedInputs(
              asRecord(pendingApproval.toolInput)?.requiredInputs || executeResult?.requiredInputs,
            )
          : [];
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.summary || '这个动作需要你确认后才会执行。',
          plan,
          inspectResult: isWorkflowCanvasSummary(inspectResult?.workflow) ? inspectResult.workflow : null,
          workflowEditPatch: isWorkflowEditPatch(editResult?.patch)
            ? editResult.patch
            : isWorkflowEditPatch(applyResult?.patch)
              ? applyResult.patch
              : null,
          workflowSuggestedInputs,
          pendingApproval,
          approvalInput: task,
          approvalValues:
            pendingApproval.toolName === 'workflow.execute'
              ? getInitialApprovalValues(asRecord(pendingApproval.toolInput)?.inputs, workflowSuggestedInputs)
              : undefined,
          toolRecords: [
            {
              id: gid('tool'),
              name: pendingApproval.toolName as AgentToolName,
              label: getToolLabel(pendingApproval.toolName),
              status: 'running',
              summary: '等待用户确认',
              detail: plan.reasoningSummary,
            },
          ],
        },
      ]);
      return;
    }
    if (plan.toolName === 'chat.respond') {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.toolInput.response || plan.summary || '我理解了，你可以继续补充。',
          plan,
          toolRecords: [getChatToolRecord(plan)],
        },
      ]);
      return;
    }
    if (plan.toolName !== 'workflow.createDraft') {
      if (plan.toolName === 'workflow.applyDraft' && applyResult?.applied && asRecord(applyResult.workflow)) {
        const workflow = applyResult.workflow as unknown as {
          id: string;
          name: string;
          nodes: unknown[];
          edges: unknown[];
        };
        applyWorkflowSnapshot(workflow);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.summary,
          plan,
          inspectResult: isWorkflowCanvasSummary(inspectResult?.workflow) ? inspectResult.workflow : null,
          workflowEditPatch: isWorkflowEditPatch(editResult?.patch) ? editResult.patch : null,
          toolRecords: [getAgentToolRecord(plan, response)],
        },
      ]);
      return;
    }
    if (!draft) {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: 'Agent 已完成规划，但当前工具没有返回可展示的工作流草案。',
          toolRecords: [
            {
              id: gid('tool'),
              name: 'workflow.createDraft',
              label: '工作流工具',
              status: 'error',
              summary: '工具调用失败',
            },
          ],
        },
      ]);
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: gid(),
        role: 'assistant',
        content: getAgentResultSummary(plan, draft),
        plan,
        draft,
        toolRecords: [getPlannerToolRecord(plan), getWorkflowToolRecord(draft)],
      },
    ]);
  };

  const updateApprovalValue = (messageId: string, nodeId: string, value: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              approvalValues: {
                ...(message.approvalValues || {}),
                [nodeId]: value,
              },
            }
          : message,
      ),
    );
  };

  const handleApprove = (message: AgentMessage) => {
    if (!message.pendingApproval || !selectedPlannerModel || isWorking) return;
    const pendingApproval = message.pendingApproval;
    void (async () => {
      setIsWorking(true);
      try {
        const runResult = await createAgentRun({
          input: message.approvalInput || message.content,
          plannerModel: buildPlannerModelPayload(selectedPlannerModel)!,
          imageModel: buildPlannerModelPayload(selectedImageModel),
          videoModel: buildPlannerModelPayload(selectedVideoModel),
          context: buildAgentContext(message.workflowEditPatch),
          approval: {
            ...pendingApproval,
            toolInput:
              pendingApproval.toolName === 'workflow.applyDraft'
                ? {
                    ...pendingApproval.toolInput,
                    workflowSnapshot: getWorkflowSnapshot(),
                  }
                : pendingApproval.toolName === 'workflow.execute'
                  ? {
                      ...pendingApproval.toolInput,
                      workflowSnapshot: getWorkflowSnapshot(),
                      inputs: buildApprovalInputPayload(message.approvalValues),
                    }
                  : pendingApproval.toolInput,
          },
        });
        if (!runResult.success || !runResult.data) {
          throw new Error(runResult.error || '确认后的工具调用失败。');
        }
        setMessages((prev) => prev.filter((item) => item.id !== message.id));
        appendAgentResult(runResult.data, message.approvalInput || message.content);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: gid(),
            role: 'assistant',
            content: error instanceof Error ? error.message : '确认后的工具调用失败。',
          },
        ]);
      } finally {
        setIsWorking(false);
      }
    })();
  };

  const handleRequestApplyPatch = (message: AgentMessage) => {
    if (!message.workflowEditPatch || !selectedPlannerModel || isWorking) return;
    void (async () => {
      setIsWorking(true);
      try {
        const runResult = await createAgentRun({
          input: '请应用当前工作流修改草案',
          plannerModel: buildPlannerModelPayload(selectedPlannerModel)!,
          imageModel: buildPlannerModelPayload(selectedImageModel),
          videoModel: buildPlannerModelPayload(selectedVideoModel),
          context: buildAgentContext(message.workflowEditPatch),
        });
        if (!runResult.success || !runResult.data) {
          throw new Error(runResult.error || '无法进入修改应用确认流程。');
        }
        appendAgentResult(runResult.data, '请应用当前工作流修改草案');
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: gid(),
            role: 'assistant',
            content: error instanceof Error ? error.message : '无法进入修改应用确认流程。',
          },
        ]);
      } finally {
        setIsWorking(false);
      }
    })();
  };

  const handleSubmit = () => {
    const task = input.trim();
    if (!task || isWorking) return;
    if (!selectedPlannerModel) {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: '当前没有可用的 Planner 模型。请先在设置中启用至少一个对话模型，然后回到 Agent 窗口继续。',
        },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { id: gid(), role: 'user', content: task }]);
    setInput('');

    void (async () => {
      setIsWorking(true);
      const runningTool: AgentToolRecord = {
        id: gid('tool'),
        name: 'workflow.createDraft',
        label: '工作流工具',
        status: 'running',
        summary: `Planner：${getPlannerModelLabel(selectedPlannerModel)}，正在根据你的需求生成可编辑草案`,
      };
      try {
        const runResult = await createAgentRun({
          input: task,
          plannerModel: buildPlannerModelPayload(selectedPlannerModel)!,
          imageModel: buildPlannerModelPayload(selectedImageModel),
          videoModel: buildPlannerModelPayload(selectedVideoModel),
          context: buildAgentContext(),
        });
        if (!runResult.success || !runResult.data) {
          setMessages((prev) => [
            ...prev,
            {
              id: gid(),
              role: 'assistant',
              content: runResult.error || 'Agent 没有生成可执行计划。请把目标、输入素材和期望产物再描述得更具体一些。',
              toolRecords: [
                {
                  id: gid('tool'),
                  name: 'agent.plan',
                  label: 'Planner',
                  status: 'error',
                  summary: 'Planner 调用失败',
                },
              ],
            },
          ]);
          return;
        }

        appendAgentResult(runResult.data, task);
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: gid(),
            role: 'assistant',
            content: error instanceof Error ? error.message : 'Agent 执行失败。',
            toolRecords: [{ ...runningTool, status: 'error', summary: '工具调用异常' }],
          },
        ]);
      } finally {
        setIsWorking(false);
      }
    })();
  };

  return (
    <div className="agent-workspace" role="dialog" aria-label="项目 Agent">
      <div className={`agent-workspace__panel ${hasUserStartedConversation ? 'agent-workspace__panel--engaged' : ''}`}>
        <div className="agent-workspace__panel-glow" aria-hidden="true" />
        <header className="agent-workspace__header">
          <div className="agent-workspace__header-main">
            <div className="agent-workspace__identity">
              <span className="agent-workspace__mark">
                <Bot size={18} />
              </span>
              <div>
                <div className="agent-workspace__eyebrow">Project Agent</div>
                <div className="agent-workspace__title">工作流协作台</div>
              </div>
            </div>
            <div className={`agent-workspace__status-pill agent-workspace__status-pill--${workspaceStatusTone}`}>
              <Sparkles size={13} />
              <span>{workspaceStatus}</span>
            </div>
            <button type="button" className="agent-workspace__icon-button" onClick={onClose} aria-label="关闭 Agent">
              <X size={17} />
            </button>
          </div>
          <section
            className={`agent-workspace__planner agent-workspace__planner--header ${hasPlannerModel ? '' : 'agent-workspace__planner--empty'}`}
          >
            <div className="agent-workspace__planner-head">
              <div className="agent-workspace__planner-copy">
                <Settings2 size={15} />
                <div>
                  <strong>Planner 模型</strong>
                  <span>{hasPlannerModel ? '负责理解需求并决定调用哪些工具' : '需要先启用对话模型'}</span>
                </div>
              </div>
              <span
                className={`agent-workspace__planner-badge ${hasPlannerModel ? '' : 'agent-workspace__planner-badge--empty'}`}
              >
                {hasPlannerModel ? '已连接' : '未就绪'}
              </span>
            </div>
            {hasPlannerModel ? (
              <label className="agent-workspace__planner-field">
                <span>当前模型</span>
                <select
                  value={selectedPlannerModel?.id || ''}
                  onChange={(event) => {
                    setSelectedPlannerModelId(event.target.value);
                    localStorage.setItem(PLANNER_MODEL_STORAGE_KEY, event.target.value);
                  }}
                  aria-label="选择 Planner 模型"
                >
                  {plannerModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {getPlannerModelLabel(model)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="agent-workspace__planner-empty">未找到可用对话模型</span>
            )}
            <div className="agent-workspace__planner-context">
              <span>关联上下文</span>
              <strong>{activeCanvasLabel}</strong>
              <small>{workflowContext.runId ? `最近运行：${workflowContext.runId}` : '还没有可复用的运行上下文'}</small>
            </div>
          </section>

          {imageModels.length > 0 && (
            <section className="agent-workspace__planner agent-workspace__planner--header">
              <div className="agent-workspace__planner-head">
                <div className="agent-workspace__planner-copy">
                  <Settings2 size={15} />
                  <div>
                    <strong>图像模型</strong>
                    <span>用于图片生成和编辑</span>
                  </div>
                </div>
              </div>
              <label className="agent-workspace__planner-field">
                <span>当前模型</span>
                <select
                  value={selectedImageModel?.id || ''}
                  onChange={(event) => {
                    setSelectedImageModelId(event.target.value);
                    localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, event.target.value);
                  }}
                  aria-label="选择图像模型"
                >
                  {imageModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {getPlannerModelLabel(model)}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {videoModels.length > 0 && (
            <section className="agent-workspace__planner agent-workspace__planner--header">
              <div className="agent-workspace__planner-head">
                <div className="agent-workspace__planner-copy">
                  <Settings2 size={15} />
                  <div>
                    <strong>视频模型</strong>
                    <span>用于视频生成</span>
                  </div>
                </div>
              </div>
              <label className="agent-workspace__planner-field">
                <span>当前模型</span>
                <select
                  value={selectedVideoModel?.id || ''}
                  onChange={(event) => {
                    setSelectedVideoModelId(event.target.value);
                    localStorage.setItem(VIDEO_MODEL_STORAGE_KEY, event.target.value);
                  }}
                  aria-label="选择视频模型"
                >
                  {videoModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {getPlannerModelLabel(model)}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
        </header>

        <div className={`agent-workspace__body ${hasUserStartedConversation ? 'agent-workspace__body--engaged' : ''}`}>
          <section
            className={`agent-workspace__hero ${hasUserStartedConversation ? 'agent-workspace__hero--engaged' : ''}`}
          >
            <div className="agent-workspace__hero-copy">
              <div className="agent-workspace__hero-badge">
                <Sparkles size={14} />
                <span>需求理解 · 草案生成 · 应用确认</span>
              </div>
              <h2 className="agent-workspace__hero-title">把一句需求，整理成可编辑工作流</h2>
              <p className="agent-workspace__hero-text">
                你只需要说明目标、素材和期望产物，Agent 会先规划，再生成草案，并在关键动作前向你确认。
              </p>
              <div className="agent-workspace__hero-metrics">
                <div className="agent-workspace__metric">
                  <span>当前状态</span>
                  <strong>{workspaceStatus}</strong>
                </div>
                <div className="agent-workspace__metric">
                  <span>当前画布</span>
                  <strong>{activeCanvasLabel}</strong>
                </div>
                <div className="agent-workspace__metric">
                  <span>最近产物</span>
                  <strong>{latestDeliverableLabel}</strong>
                </div>
              </div>
            </div>
          </section>

          <section
            className={`agent-workspace__scope ${hasUserStartedConversation ? 'agent-workspace__scope--engaged' : ''}`}
          >
            <div>
              <Sparkles size={16} />
              <strong>需求梳理</strong>
              <span>先理解你的目标、限制和交付格式</span>
            </div>
            <div>
              <Wrench size={16} />
              <strong>工具规划</strong>
              <span>根据上下文挑选检查、生成或应用动作</span>
            </div>
            <div>
              <Bot size={16} />
              <strong>结果交付</strong>
              <span>保留草案、审批和后续迭代入口</span>
            </div>
          </section>

          <section
            className={`agent-workspace__conversation ${hasUserStartedConversation ? 'agent-workspace__conversation--engaged' : ''}`}
          >
            <div className="agent-workspace__section-heading">
              <div>
                <strong>协作记录</strong>
                <span>按顺序保留需求、工具执行和交付结果，方便继续追改。</span>
              </div>
              <small>{conversationCount} 条消息</small>
            </div>

            <div className="agent-workspace__messages">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`agent-workspace__message agent-workspace__message--${message.role}`}
                >
                  <div className="agent-workspace__message-meta">
                    <span className="agent-workspace__message-avatar">
                      {message.role === 'assistant' ? <Bot size={14} /> : '你'}
                    </span>
                    <div className="agent-workspace__message-meta-copy">
                      <strong>{message.role === 'assistant' ? '项目 Agent' : '你'}</strong>
                      <span>{message.role === 'assistant' ? '需求理解、工具规划与交付' : '本轮目标与补充要求'}</span>
                    </div>
                  </div>

                  <div className="agent-workspace__message-body">
                    <div className="agent-workspace__message-text">{message.content}</div>
                    {message.toolRecords && message.toolRecords.length > 0 && (
                      <div className="agent-workspace__tools">
                        {message.toolRecords.map((record) => {
                          const expanded = expandedTools.has(record.id);
                          return (
                            <div
                              key={record.id}
                              className={`agent-workspace__tool agent-workspace__tool--${record.status}`}
                            >
                              <button type="button" onClick={() => toggleToolRecord(record.id)}>
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span>{record.label}</span>
                                <small>
                                  {record.status === 'running'
                                    ? '执行中'
                                    : record.status === 'success'
                                      ? '已完成'
                                      : '失败'}
                                </small>
                              </button>
                              {expanded && (
                                <div className="agent-workspace__tool-detail">
                                  <strong>{record.summary}</strong>
                                  {record.detail && <span>{record.detail}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {message.draft && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>工作流草案</strong>
                          <span>
                            {message.draft.workflow.nodes.length} 节点 · {message.draft.workflow.edges.length} 连线
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyWorkflowDraft(message.draft as WorkflowDraftResponse)}
                          disabled={!message.draft.validation.valid}
                        >
                          <Maximize2 size={14} />
                          新建画布
                        </button>
                      </div>
                    )}
                    {message.inspectResult && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>当前画布摘要</strong>
                          <span>
                            {message.inspectResult.nodeCount} 节点 · {message.inspectResult.edgeCount} 连线 · 签名{' '}
                            {message.inspectResult.signature}
                          </span>
                        </div>
                      </div>
                    )}
                    {message.workflowEditPatch && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>修改草案</strong>
                          <span>{message.workflowEditPatch.summary}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRequestApplyPatch(message)}
                          disabled={
                            !message.workflowEditPatch.validation.valid ||
                            message.workflowEditPatch.operations.length === 0 ||
                            isWorking
                          }
                        >
                          <Play size={14} />
                          申请应用
                        </button>
                      </div>
                    )}
                    {message.pendingApproval && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>需要确认</strong>
                          <span>
                            {message.pendingApproval.toolName === 'workflow.applyDraft'
                              ? '确认后才会把修改草案应用到当前画布'
                              : '确认输入项和本次覆盖值后，才会开始运行当前已保存工作流'}
                          </span>
                        </div>
                        {message.pendingApproval.toolName === 'workflow.execute' && (
                          <div className="agent-workspace__approval-inputs">
                            {message.workflowSuggestedInputs && message.workflowSuggestedInputs.length > 0 ? (
                              message.workflowSuggestedInputs.map((item) => (
                                <label key={item.nodeId} className="agent-workspace__approval-input">
                                  <div className="agent-workspace__approval-input-copy">
                                    <strong>{item.label}</strong>
                                    <span>
                                      {item.kind === 'text'
                                        ? '文本输入'
                                        : item.kind === 'image'
                                          ? '图片输入'
                                          : item.kind === 'video'
                                            ? '视频输入'
                                            : item.kind === 'audio'
                                              ? '音频输入'
                                              : '蒙版输入'}
                                      {` · 节点 ${item.nodeId}`}
                                    </span>
                                    <small>当前值：{item.currentValue?.trim() ? item.currentValue : '未设置'}</small>
                                    {item.aliases.length > 0 && (
                                      <small>可匹配别名：{item.aliases.slice(0, 4).join('、')}</small>
                                    )}
                                  </div>
                                  {item.kind === 'text' ? (
                                    <textarea
                                      rows={3}
                                      value={message.approvalValues?.[item.nodeId] || ''}
                                      onChange={(event) =>
                                        updateApprovalValue(message.id, item.nodeId, event.target.value)
                                      }
                                      placeholder={getApprovalInputPlaceholder(item)}
                                      disabled={isWorking}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={message.approvalValues?.[item.nodeId] || ''}
                                      onChange={(event) =>
                                        updateApprovalValue(message.id, item.nodeId, event.target.value)
                                      }
                                      placeholder={getApprovalInputPlaceholder(item)}
                                      disabled={isWorking}
                                    />
                                  )}
                                </label>
                              ))
                            ) : (
                              <div className="agent-workspace__approval-empty">
                                当前工作流没有显式输入节点，本次会按已保存默认值直接运行。
                              </div>
                            )}
                          </div>
                        )}
                        <button type="button" onClick={() => handleApprove(message)} disabled={isWorking}>
                          <Play size={14} />
                          {message.pendingApproval.toolName === 'workflow.applyDraft' ? '确认应用' : '确认运行'}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {isWorking && (
                <article className="agent-workspace__message agent-workspace__message--assistant">
                  <div className="agent-workspace__message-meta">
                    <span className="agent-workspace__message-avatar">
                      <Bot size={14} />
                    </span>
                    <div className="agent-workspace__message-meta-copy">
                      <strong>项目 Agent</strong>
                      <span>正在分析你的需求和当前上下文</span>
                    </div>
                  </div>
                  <div className="agent-workspace__message-body">
                    <div className="agent-workspace__working">
                      <Loader2 size={15} className="agent-workspace__spin" />
                      正在判断任务并调用可用工具...
                    </div>
                  </div>
                </article>
              )}
            </div>
          </section>
        </div>

        <footer className="agent-workspace__composer">
          <div className="agent-workspace__composer-main">
            <div className="agent-workspace__composer-topline">
              <span>继续描述你的目标</span>
              <small>{hasPlannerModel ? 'Ctrl / Cmd + Enter 发送' : '启用模型后可开始协作'}</small>
            </div>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              rows={3}
              maxLength={12000}
              placeholder={hasPlannerModel ? STARTER_PROMPT : '请先启用对话模型，Agent 才能开始规划任务'}
            />
          </div>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} aria-label="发送给 Agent">
            {isWorking ? <Loader2 size={17} className="agent-workspace__spin" /> : <Send size={17} />}
          </button>
        </footer>

        {(latestDraft || latestWorkflowEditPatch) && (
          <div className="agent-workspace__hint">
            {latestWorkflowEditPatch
              ? '最近一次修改草案已生成。你可以继续描述调整要求，或申请把它应用到当前画布。'
              : '最近一次结果已生成。你可以打开画布检查，也可以继续描述修改要求。'}
          </div>
        )}
      </div>
    </div>
  );
}
