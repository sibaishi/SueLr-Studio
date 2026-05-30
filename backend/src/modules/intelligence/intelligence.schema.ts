import { z } from 'zod';
import { KNOWLEDGE_CATEGORIES } from './knowledge/knowledge.service.ts';

export const intelligenceRunRequestSchema = z.object({
  input: z.string().trim().min(1, 'input 不能为空').max(12000, 'input 不能超过 12000 字符'),
  mode: z.enum(['inspect', 'plan']).default('inspect'),
  skills: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const intelligenceRunIdSchema = z.string().trim().min(1, 'runId 不能为空').max(120, 'runId 不能超过 120 字符');

export const workflowDraftRequestSchema = z.object({
  input: z.string().trim().min(1, 'input 不能为空').max(12000, 'input 不能超过 12000 字符'),
  name: z.string().trim().max(200, 'name 不能超过 200 字符').optional(),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const knowledgeSearchRequestSchema = z.object({
  query: z.string().trim().max(2000, 'query 不能超过 2000 字符').default(''),
  categories: z.array(z.enum(KNOWLEDGE_CATEGORIES)).max(KNOWLEDGE_CATEGORIES.length).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const knowledgeWriteRequestSchema = z.object({
  category: z.enum(KNOWLEDGE_CATEGORIES),
  title: z.string().trim().min(1, 'title 不能为空').max(240, 'title 不能超过 240 字符'),
  content: z.string().trim().min(1, 'content 不能为空').max(12000, 'content 不能超过 12000 字符'),
  structured: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  scope: z.enum(['local-private', 'local-project']).optional(),
  source: z
    .object({
      kind: z.string().trim().min(1).max(80),
      id: z.string().trim().max(240).optional(),
      label: z.string().trim().max(240).optional(),
    })
    .optional(),
  evidence: z
    .array(
      z.object({
        kind: z.string().trim().min(1).max(80),
        id: z.string().trim().max(240).optional(),
        url: z.string().trim().max(1000).optional(),
        summary: z.string().trim().max(1000).optional(),
      }),
    )
    .max(20)
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmed: z.boolean().optional(),
});

export type IntelligenceRunRequest = z.infer<typeof intelligenceRunRequestSchema>;
export type WorkflowDraftRequest = z.infer<typeof workflowDraftRequestSchema>;
export type KnowledgeSearchRequest = z.infer<typeof knowledgeSearchRequestSchema>;
export type KnowledgeWriteRequest = z.infer<typeof knowledgeWriteRequestSchema>;
