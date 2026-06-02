import { z } from 'zod';
import { getWorkflowArchitectNodeTypes } from '../../../../../src/shared/workflow/node-catalog.js';

export const WORKFLOW_ARCHITECT_NODE_TYPES = getWorkflowArchitectNodeTypes() as [string, ...string[]];

const nodeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);

export const workflowArchitectNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.enum(WORKFLOW_ARCHITECT_NODE_TYPES),
  label: z.string().trim().max(120).optional(),
  purpose: z.string().trim().max(600).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .optional(),
});

export const workflowArchitectEdgeSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  source: nodeIdSchema,
  sourceHandle: z.string().trim().min(1).max(80),
  target: nodeIdSchema,
  targetHandle: z.string().trim().min(1).max(80),
});

export const workflowArchitectDslSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  nodes: z.array(workflowArchitectNodeSchema).min(2).max(40),
  edges: z.array(workflowArchitectEdgeSchema).min(1).max(80),
  settings: z
    .object({
      workflowExecution: z
        .object({
          enabled: z.boolean().default(false),
          maxConcurrency: z.number().int().min(1).max(16).default(4),
        })
        .optional(),
    })
    .default({}),
  reasoningSummary: z.string().trim().max(1200).optional(),
  warnings: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
});

export type WorkflowArchitectDsl = z.infer<typeof workflowArchitectDslSchema>;
export type WorkflowArchitectNodeType = (typeof WORKFLOW_ARCHITECT_NODE_TYPES)[number];
