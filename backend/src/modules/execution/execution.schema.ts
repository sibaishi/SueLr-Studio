import { z } from 'zod';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const workflowIdSchema = z
  .string()
  .trim()
  .min(1, 'workflow.id 不能为空')
  .max(120, 'workflow.id 长度超限')
  .regex(/^[a-zA-Z0-9._-]+$/, 'workflow.id 包含非法字符');

const runIdSchema = z
  .string()
  .trim()
  .min(1, 'runId 不能为空')
  .max(200, 'runId 长度超限')
  .regex(/^[a-zA-Z0-9._:-]+$/, 'runId 包含非法字符');

const executionBodySchema = z
  .preprocess(
    (value) => (value === undefined ? {} : value),
    z.custom<PlainObject>(isPlainObject, {
      message: '执行请求体必须为对象',
    }),
  )
  .superRefine((value, context) => {
    if (value.source !== 'draft') return;
    if (!Array.isArray(value.nodes)) {
      context.addIssue({
        code: 'custom',
        message: 'draft 执行必须提供 nodes 数组',
      });
    }
    if (!Array.isArray(value.edges)) {
      context.addIssue({
        code: 'custom',
        message: 'draft 执行必须提供 edges 数组',
      });
    }
  })
  .transform((value) => {
    const source = value.source === 'draft' ? 'draft' : 'persisted';
    return {
      source,
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
      ...(Array.isArray(value.nodes) ? { nodes: value.nodes } : {}),
      ...(Array.isArray(value.edges) ? { edges: value.edges } : {}),
      ...(isPlainObject(value.apiConfig) ? { apiConfig: value.apiConfig } : {}),
    } as PlainObject;
  });

const validateExecutionWorkflowIdBoundary = zodValidator(workflowIdSchema);
const validateExecutionRunIdBoundary = zodValidator(runIdSchema);
const validateExecutionBodyBoundary = zodValidator(executionBodySchema);

export function validateExecutionWorkflowId(value: DynamicValue): string {
  return validateExecutionWorkflowIdBoundary(String(value || ''));
}

export function validateExecutionRunId(value: DynamicValue): string {
  return validateExecutionRunIdBoundary(String(value || ''));
}

export function validateExecutionBody(value: DynamicValue): PlainObject {
  return validateExecutionBodyBoundary(value);
}
