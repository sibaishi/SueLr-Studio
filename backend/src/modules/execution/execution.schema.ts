import { ValidationError } from '../../app/errors/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateExecutionWorkflowId(value: DynamicValue): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new ValidationError('VALIDATION_ERROR', 'workflow.id 不能为空');
  if (normalized.length > 120) throw new ValidationError('VALIDATION_ERROR', 'workflow.id 长度超限');
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', 'workflow.id 包含非法字符');
  return normalized;
}

export function validateExecutionRunId(value: DynamicValue): string {
  const normalized = String(value || '').trim();
  if (!normalized) throw new ValidationError('VALIDATION_ERROR', 'runId 不能为空');
  if (normalized.length > 200) throw new ValidationError('VALIDATION_ERROR', 'runId 长度超限');
  if (!/^[a-zA-Z0-9._:-]+$/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', 'runId 包含非法字符');
  return normalized;
}

export function validateExecutionBody(value: DynamicValue): PlainObject {
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    throw new ValidationError('VALIDATION_ERROR', '执行请求体必须为对象');
  }

  const source = value.source === 'draft' ? 'draft' : 'persisted';
  if (source === 'draft') {
    if (!Array.isArray(value.nodes)) throw new ValidationError('VALIDATION_ERROR', 'draft 执行必须提供 nodes 数组');
    if (!Array.isArray(value.edges)) throw new ValidationError('VALIDATION_ERROR', 'draft 执行必须提供 edges 数组');
  }

  return {
    source,
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(Array.isArray(value.nodes) ? { nodes: value.nodes } : {}),
    ...(Array.isArray(value.edges) ? { edges: value.edges } : {}),
    ...(isPlainObject(value.apiConfig) ? { apiConfig: value.apiConfig } : {}),
  };
}
