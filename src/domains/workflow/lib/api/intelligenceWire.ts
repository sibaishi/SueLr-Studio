export type WorkflowDraftPlannerModelWire = {
  id: string;
  modelId?: string;
  configId?: string;
  configName?: string;
  label?: string;
};

export type AgentPlanToolName =
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
  | 'result.inspect';

export type AgentPlanKnowledgeItem = {
  id: string;
  title: string;
  category: string;
  sourceKind: string;
  nodeType?: string;
};

export type AgentPlanWire = {
  id: string;
  source: 'llm' | 'local-fallback' | 'user-approved';
  plannerModel: WorkflowDraftPlannerModelWire & { modelId: string };
  imageModel?: WorkflowDraftPlannerModelWire | null;
  videoModel?: WorkflowDraftPlannerModelWire | null;
  summary: string;
  toolName: AgentPlanToolName;
  toolInput: Record<string, unknown> & {
    input?: string;
    plannerNotes?: string;
    response?: string;
    context?: Record<string, unknown>;
    workflowId?: string;
    workflowName?: string;
    runId?: string;
    inputs?: Record<string, unknown>;
    confirmed?: boolean;
  };
  reasoningSummary: string;
  warnings?: string[];
  knowledgeContext?: {
    source: string;
    items: AgentPlanKnowledgeItem[];
  };
};

export type AgentPlanViewModel = Omit<AgentPlanWire, 'warnings' | 'knowledgeContext'> & {
  warnings: string[];
  knowledgeContext: {
    source: string;
    items: AgentPlanKnowledgeItem[];
  };
};

export function toAgentPlanViewModel(wire: AgentPlanWire): AgentPlanViewModel {
  return {
    ...wire,
    warnings: Array.isArray(wire.warnings) ? wire.warnings : [],
    knowledgeContext: wire.knowledgeContext || { source: 'none', items: [] },
  };
}
