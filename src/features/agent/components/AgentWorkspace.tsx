import {
  type AgentPendingApproval,
  type AgentPlan,
  type AgentRunResponse,
  type WorkflowDraftResponse,
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
  | 'workflow.createDraft'
  | 'workflow.execute'
  | 'workflow.diagnose'
  | 'workflow.summarizeRun';

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
  toolRecords?: AgentToolRecord[];
  pendingApproval?: AgentPendingApproval;
  approvalInput?: string;
};

interface AgentWorkspaceProps {
  open: boolean;
  onClose: () => void;
  onOpenWorkflow: () => void;
  plannerModels: ModelInfo[];
}

const STARTER_PROMPT = '例如：帮我为一个新上市的保温杯设计一套电商主图工作流，并生成可编辑画布';
const PLANNER_MODEL_STORAGE_KEY = 'suelr_agent_planner_model';

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
    label:
      plan.toolName === 'workflow.execute'
        ? '运行工作流'
        : plan.toolName === 'workflow.diagnose'
          ? '诊断运行'
          : '运行汇总',
    status: 'success',
    summary: response || plan.summary,
    detail: plan.reasoningSummary,
  };
}

function getPlannerModelLabel(model: ModelInfo) {
  return `${model.modelId || model.id}${model.configName ? ` · ${model.configName}` : ''}`;
}

export default function AgentWorkspace({ open, onClose, onOpenWorkflow, plannerModels }: AgentWorkspaceProps) {
  const [input, setInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [expandedTools, setExpandedTools] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedPlannerModelId, setSelectedPlannerModelId] = useState(
    () => localStorage.getItem(PLANNER_MODEL_STORAGE_KEY) || '',
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
  const hasPlannerModel = Boolean(selectedPlannerModel);
  const canSubmit = input.trim().length > 0 && !isWorking && hasPlannerModel;
  const latestDraft = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].draft) return messages[index].draft;
    }
    return null;
  }, [messages]);

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

  const buildAgentContext = () => ({
    ...(workflowContext.workflowId ? { workflowId: workflowContext.workflowId } : {}),
    ...(workflowContext.workflowName ? { workflowName: workflowContext.workflowName } : {}),
    ...(workflowContext.runId ? { runId: workflowContext.runId } : {}),
  });

  const appendAgentResult = (runResult: AgentRunResponse, task: string) => {
    const { plan, response, workflowDraft: draft, pendingApproval } = runResult;
    if (pendingApproval) {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.summary || '这个动作需要你确认后才会执行。',
          plan,
          pendingApproval,
          approvalInput: task,
          toolRecords: [
            {
              id: gid('tool'),
              name: pendingApproval.toolName,
              label: '运行工作流',
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
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.summary,
          plan,
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

  const handleApprove = (message: AgentMessage) => {
    if (!message.pendingApproval || !selectedPlannerModel || isWorking) return;
    void (async () => {
      setIsWorking(true);
      try {
        const runResult = await createAgentRun({
          input: message.approvalInput || message.content,
          plannerModel: {
            id: selectedPlannerModel.id,
            modelId: selectedPlannerModel.modelId || selectedPlannerModel.id,
            configId: selectedPlannerModel.configId,
            configName: selectedPlannerModel.configName,
            label: getPlannerModelLabel(selectedPlannerModel),
          },
          context: buildAgentContext(),
          approval: message.pendingApproval,
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
          plannerModel: {
            id: selectedPlannerModel.id,
            modelId: selectedPlannerModel.modelId || selectedPlannerModel.id,
            configId: selectedPlannerModel.configId,
            configName: selectedPlannerModel.configName,
            label: getPlannerModelLabel(selectedPlannerModel),
          },
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
    <div className="agent-workspace" role="dialog" aria-label="AI Agent">
      <div className="agent-workspace__panel">
        <header className="agent-workspace__header">
          <div className="agent-workspace__identity">
            <span className="agent-workspace__mark">
              <Bot size={18} />
            </span>
            <div>
              <div className="agent-workspace__eyebrow">Project Agent</div>
              <div className="agent-workspace__title">AI Agent</div>
            </div>
          </div>
          <button type="button" className="agent-workspace__icon-button" onClick={onClose} aria-label="关闭 Agent">
            <X size={17} />
          </button>
        </header>

        <div className="agent-workspace__body">
          <section className={`agent-workspace__planner ${hasPlannerModel ? '' : 'agent-workspace__planner--empty'}`}>
            <div className="agent-workspace__planner-copy">
              <Settings2 size={15} />
              <div>
                <strong>Planner 模型</strong>
                <span>{hasPlannerModel ? '负责理解需求并决定调用哪些工具' : '需要先启用对话模型'}</span>
              </div>
            </div>
            {hasPlannerModel ? (
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
            ) : (
              <span className="agent-workspace__planner-empty">未找到可用对话模型</span>
            )}
          </section>

          <section className="agent-workspace__scope">
            <div>
              <Sparkles size={16} />
              <span>对话</span>
            </div>
            <div>
              <Wrench size={16} />
              <span>工具调用</span>
            </div>
            <div>
              <Bot size={16} />
              <span>结果交付</span>
            </div>
          </section>

          <div className="agent-workspace__messages">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`agent-workspace__message agent-workspace__message--${message.role}`}
              >
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
                              {record.status === 'running' ? '执行中' : record.status === 'success' ? '已完成' : '失败'}
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
                {message.pendingApproval && (
                  <div className="agent-workspace__result">
                    <div>
                      <strong>需要确认</strong>
                      <span>确认后才会开始运行当前已保存工作流</span>
                    </div>
                    <button type="button" onClick={() => handleApprove(message)} disabled={isWorking}>
                      <Play size={14} />
                      确认运行
                    </button>
                  </div>
                )}
              </article>
            ))}
            {isWorking && (
              <article className="agent-workspace__message agent-workspace__message--assistant">
                <div className="agent-workspace__working">
                  <Loader2 size={15} />
                  正在判断任务并调用可用工具...
                </div>
              </article>
            )}
          </div>
        </div>

        <footer className="agent-workspace__composer">
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
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} aria-label="发送给 Agent">
            {isWorking ? <Loader2 size={17} /> : <Send size={17} />}
          </button>
        </footer>

        {latestDraft && (
          <div className="agent-workspace__hint">最近一次结果已生成。你可以打开画布检查，也可以继续描述修改要求。</div>
        )}
      </div>
    </div>
  );
}
