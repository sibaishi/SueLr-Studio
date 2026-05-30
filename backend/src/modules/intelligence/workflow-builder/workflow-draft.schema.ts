import { z } from 'zod';

export const workflowDraftStageSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  nodeType: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  knowledgeIds: z.array(z.string().trim().min(1)).default([]),
});

export const workflowDraftKnowledgeInfluenceSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  sourceKind: z.string().trim().min(1),
  nodeType: z.string().trim().min(1).optional(),
  effect: z.enum(['node-capability', 'prompt-guidance', 'saved-workflow-reference', 'model-context']),
});

export const workflowDraftSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  intentId: z.string().trim().min(1),
  stages: z.array(workflowDraftStageSchema).min(1),
  approvalsRequired: z.array(z.string()),
  knowledgeInfluences: z.array(workflowDraftKnowledgeInfluenceSchema).default([]),
});

export type WorkflowDraft = z.infer<typeof workflowDraftSchema>;
export type WorkflowDraftStage = z.infer<typeof workflowDraftStageSchema>;
