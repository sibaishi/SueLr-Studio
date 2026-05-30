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

export interface WorkflowDraftResponse {
  intent: WorkflowDraftIntent;
  draft: WorkflowDraftPlan;
  workflow: PersistedWorkflow;
  validation: WorkflowDraftValidation;
  approvalsRequired: string[];
  knowledgeContext?: WorkflowDraftKnowledgeContext;
}

export interface CreateWorkflowDraftInput {
  input: string;
  name?: string;
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

export async function createWorkflowDraft(input: CreateWorkflowDraftInput) {
  return workflowApiFetch<WorkflowDraftResponse>('/intelligence/workflow-drafts', {
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
