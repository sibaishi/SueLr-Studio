import { z } from 'zod';

const plannerModelSchema = z
  .object({
    id: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
    configId: z.string().optional(),
    configName: z.string().optional(),
    label: z.string().optional(),
  })
  .passthrough();

const knowledgeItemSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string(),
    category: z.string(),
    sourceKind: z.string(),
    nodeType: z.string().optional(),
  })
  .passthrough();

export const agentPlanWireSchema = z
  .object({
    id: z.string().trim().min(1),
    source: z.enum(['llm', 'local-fallback', 'user-approved']),
    plannerModel: plannerModelSchema,
    imageModel: plannerModelSchema.nullish(),
    videoModel: plannerModelSchema.nullish(),
    summary: z.string(),
    toolName: z.enum([
      'chat.respond',
      'workflow.inspect',
      'workflow.edit',
      'workflow.applyDraft',
      'workflow.createDraft',
      'workflow.execute',
      'workflow.diagnose',
      'workflow.summarizeRun',
      'image.generate',
      'image.edit',
      'image.compare',
      'video.generate',
      'copy.write',
      'prompt.optimize',
      'result.inspect',
    ]),
    toolInput: z.record(z.string(), z.unknown()),
    reasoningSummary: z.string(),
    warnings: z.array(z.string()).default([]),
    knowledgeContext: z
      .object({
        source: z.string(),
        items: z.array(knowledgeItemSchema),
      })
      .default({ source: 'none', items: [] }),
  })
  .passthrough();
