import { workflowApiFetch } from '@/domains/workflow/lib/api/base';
import type { PersistedWorkflow } from '@/domains/workflow/lib/persistenceTypes';

export type WorkflowIntentDomain =
  | 'ecommerce-image'
  | 'brand-visual'
  | 'social-image'
  | 'generic-image'
  | 'chat-text'
  | 'video-generation';

export interface WorkflowDraftIntentInput {
  id: string;
  label: string;
  kind: 'image' | 'text' | 'video' | 'audio';
}

export interface WorkflowDraftIntent {
  id: string;
  sourceText: string;
  name: string;
  goal: string;
  domain: WorkflowIntentDomain;
  inputs: WorkflowDraftIntentInput[];
  outputCount: number;
  requiresImageInput: boolean;
  requiresTextInput: boolean;
  requiresVideoInput?: boolean;
  requiresAudioInput?: boolean;
}

export interface WorkflowDraftStage {
  id: string;
  label: string;
  nodeType: string;
  purpose: string;
  knowledgeIds?: string[];
}

export interface WorkflowDraftKnowledgeInfluence {
  id: string;
  title: string;
  category: string;
  sourceKind: string;
  nodeType?: string;
  effect: 'node-capability' | 'prompt-guidance' | 'saved-workflow-reference' | 'model-context';
}

export interface WorkflowDraftPlan {
  id: string;
  name: string;
  description: string;
  intentId: string;
  stages: WorkflowDraftStage[];
  approvalsRequired: string[];
  knowledgeInfluences?: WorkflowDraftKnowledgeInfluence[];
}

export interface WorkflowDraftValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  nodeId?: string;
  edgeId?: string;
}

export interface WorkflowDraftValidation {
  valid: boolean;
  issues: WorkflowDraftValidationIssue[];
}

export interface WorkflowDraftKnowledgeItem {
  id: string;
  type: string;
  category: string;
  title: string;
  content: string;
  structured?: Record<string, unknown>;
  source: {
    kind: string;
    id?: string;
    label?: string;
  };
  relevance?: number;
}

export interface WorkflowDraftKnowledgeContext {
  items: WorkflowDraftKnowledgeItem[];
  source: string;
  governance: string;
}

export interface WorkflowDraftPlannerModel {
  id: string;
  modelId?: string;
  configId?: string;
  configName?: string;
  label?: string;
}

export interface WorkflowDraftAgentContext {
  plannerModel?: WorkflowDraftPlannerModel;
}

export interface AgentPlan {
  id: string;
  source: 'llm' | 'local-fallback' | 'user-approved';
  plannerModel: WorkflowDraftPlannerModel & {
    modelId: string;
  };
  summary: string;
  toolName:
    | 'chat.respond'
    | 'workflow.createDraft'
    | 'workflow.execute'
    | 'workflow.diagnose'
    | 'workflow.summarizeRun';
  toolInput: {
    input?: string;
    plannerNotes?: string;
    response?: string;
    context?: Record<string, unknown>;
    workflowId?: string;
    workflowName?: string;
    runId?: string;
    inputs?: Record<string, unknown>;
    confirmed?: boolean;
    [key: string]: unknown;
  };
  reasoningSummary: string;
  warnings: string[];
  knowledgeContext: {
    source: string;
    items: Array<{
      id: string;
      title: string;
      category: string;
      sourceKind: string;
      nodeType?: string;
    }>;
  };
}

export interface CreateAgentPlanInput {
  input: string;
  plannerModel: WorkflowDraftPlannerModel & {
    modelId: string;
  };
  context?: Record<string, unknown>;
  approval?: AgentPendingApproval;
}

export interface AgentPendingApproval {
  id: string;
  toolName: 'workflow.execute';
  toolInput: Record<string, unknown>;
  summary?: string;
}

export interface AgentRunToolResult {
  skillId: string;
  output: unknown;
}

export interface AgentRunTrace {
  id: string;
  status: 'completed' | 'failed';
  mode: string;
  input: string;
  requestedSkills: string[];
  skillResults: AgentRunToolResult[];
  createdAt: number;
  updatedAt: number;
  sourceRuntime: 'local';
}

export interface AgentRunResponse {
  plan: AgentPlan;
  trace: AgentRunTrace;
  toolResults: AgentRunToolResult[];
  response?: string;
  workflowDraft: WorkflowDraftResponse | null;
  approvalRequired?: boolean;
  pendingApproval?: AgentPendingApproval | null;
}

export interface WorkflowDraftResponse {
  intent: WorkflowDraftIntent;
  draft: WorkflowDraftPlan;
  workflow: PersistedWorkflow;
  validation: WorkflowDraftValidation;
  approvalsRequired: string[];
  knowledgeContext?: WorkflowDraftKnowledgeContext;
  architect?: {
    source: 'llm' | 'skipped' | 'failed';
    used: boolean;
    reason: string;
    issues?: WorkflowDraftValidationIssue[];
  };
  agentContext?: WorkflowDraftAgentContext;
}

export interface CreateWorkflowDraftInput {
  input: string;
  name?: string;
  context?: {
    agent?: WorkflowDraftAgentContext;
    [key: string]: unknown;
  };
}

export interface IntelligenceSkillRunResult {
  skillId: string;
  output: unknown;
}

export interface IntelligenceRunTrace {
  id: string;
  status: string;
  requestedSkills: string[];
  skillResults: IntelligenceSkillRunResult[];
}

export interface IntelligenceTeamRoleOutput {
  roleId: string;
  title: string;
  summary: string;
  trace?: {
    source?: string;
    taskIds?: string[];
    evidence?: string[];
  };
  data?: Record<string, unknown>;
}

export interface IntelligenceTeamRunOutput {
  team: {
    id: string;
    title: string;
    description?: string;
  };
  plan: {
    brief: string;
    intentTags: string[];
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      roleHint: string;
      priority: string;
    }>;
  };
  roleOutputs: IntelligenceTeamRoleOutput[];
  review: {
    score: number;
    verdict: 'pass' | 'needs-confirmation' | 'needs-rework';
    summary: string;
    suggestions: string[];
  };
  workflowDraft: WorkflowDraftResponse | null;
  approvalsRequired: string[];
}

export async function createWorkflowDraft(input: CreateWorkflowDraftInput) {
  return workflowApiFetch<WorkflowDraftResponse>('/intelligence/workflow-drafts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createAgentPlan(input: CreateAgentPlanInput) {
  return workflowApiFetch<AgentPlan>('/intelligence/agent-plans', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createAgentRun(input: CreateAgentPlanInput) {
  return workflowApiFetch<AgentRunResponse>('/intelligence/agent-runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createIntelligenceRun(input: {
  input: string;
  mode?: 'inspect' | 'plan';
  skills?: string[];
  context?: Record<string, unknown>;
}) {
  return workflowApiFetch<IntelligenceRunTrace>('/intelligence/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
