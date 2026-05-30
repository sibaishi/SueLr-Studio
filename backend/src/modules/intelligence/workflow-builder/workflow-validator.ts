import { ValidationError } from '../../../app/errors/index.ts';
import { normalizePersistedWorkflow } from '../../workflows/workflows.schema.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  nodeId?: string;
  edgeId?: string;
};

export function validateCompiledWorkflow(workflow: PlainObject, options: { scope?: DynamicValue } = {}) {
  const issues: WorkflowValidationIssue[] = [];
  let normalized: PlainObject;

  try {
    normalized = normalizePersistedWorkflow(workflow, {
      preserveCreatedAt: true,
      updatedAt: Number(workflow.updatedAt) || Date.now(),
      scope: options.scope,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      issues.push({
        code: error.code,
        message: error.message,
        severity: 'error',
      });
      return { valid: false, issues, workflow: null };
    }
    throw error;
  }

  const nodes = Array.isArray(normalized.nodes) ? (normalized.nodes as PlainObject[]) : [];
  const edges = Array.isArray(normalized.edges) ? (normalized.edges as PlainObject[]) : [];
  const imageGenNodes = nodes.filter((node) => node.type === 'imageGen');
  for (const node of imageGenNodes) {
    if (!String(node.data?.model || '').trim()) {
      issues.push({
        code: 'MODEL_MISSING',
        message: '图像生成节点尚未选择模型，应用草案后需要用户确认模型。',
        severity: 'warning',
        nodeId: String(node.id || ''),
      });
    }
  }

  const inputNodeIds = new Set(
    nodes.filter((node) => ['imageInput', 'textInput'].includes(String(node.type))).map((node) => String(node.id || '')),
  );
  for (const nodeId of inputNodeIds) {
    const hasOutgoing = edges.some((edge) => edge.source === nodeId);
    if (!hasOutgoing) {
      issues.push({
        code: 'INPUT_UNUSED',
        message: `输入节点 ${nodeId} 没有连接到下游节点。`,
        severity: 'error',
        nodeId,
      });
    }
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
    workflow: normalized,
  };
}
