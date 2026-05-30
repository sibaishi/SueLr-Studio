import { z } from 'zod';
import { ValidationError } from '../../app/errors/index.ts';
import { zodValidator } from '../../app/middleware/zod-validator.ts';
import { getNodeContract, getNodeDataDefaults } from '../../engine/contracts/node-registry.ts';
import { ensureResourceOwnership } from '../../platform/runtime/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';
import { CURRENT_WORKFLOW_SCHEMA_VERSION } from './workflow-migrations.ts';

type WorkflowNormalizeOptions = {
  preserveCreatedAt?: boolean;
  updatedAt?: number;
  scope?: DynamicValue;
};

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const workflowIdSchema = z
  .string()
  .trim()
  .min(1, 'workflow.id 不能为空')
  .max(120, 'workflow.id 长度超限')
  .regex(/^[a-zA-Z0-9._-]+$/, 'workflow.id 包含非法字符');

const workflowBodySchema = z.custom<PlainObject>(isPlainObject, {
  message: '工作流请求体必须为对象',
});

export const workflowImportQuerySchema = z
  .object({
    generateNewId: z.enum(['true', 'false']).optional(),
    mode: z.enum(['generate_new_id', 'preserve_id', 'overwrite']).optional(),
  })
  .passthrough();

const validateWorkflowIdBoundary = zodValidator(workflowIdSchema);
const ensureWorkflowBodyBoundary = zodValidator(workflowBodySchema);

export function validateWorkflowId(value: DynamicValue, fieldName = 'workflow.id') {
  if (fieldName === 'workflow.id') return validateWorkflowIdBoundary(String(value || ''));
  const normalized = String(value || '').trim();
  if (!normalized) throw new ValidationError('VALIDATION_ERROR', `${fieldName} 不能为空`);
  if (normalized.length > 120) throw new ValidationError('VALIDATION_ERROR', `${fieldName} 长度超限`);
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) throw new ValidationError('VALIDATION_ERROR', `${fieldName} 包含非法字符`);
  return normalized;
}

export function ensureWorkflowBody(value: DynamicValue): PlainObject {
  return ensureWorkflowBodyBoundary(value);
}

function normalizeNode(node: DynamicValue, index: number) {
  if (!isPlainObject(node)) {
    throw new ValidationError('VALIDATION_ERROR', `workflow.nodes[${index}] 必须为对象`, { path: `nodes[${index}]` });
  }
  if (typeof node.id !== 'string' || !node.id.trim()) {
    throw new ValidationError('VALIDATION_ERROR', `workflow.nodes[${index}].id 不能为空`, {
      path: `nodes[${index}].id`,
    });
  }
  if (typeof node.type !== 'string' || !node.type.trim()) {
    throw new ValidationError('VALIDATION_ERROR', `workflow.nodes[${index}].type 不能为空`, {
      path: `nodes[${index}].type`,
      nodeId: node.id,
    });
  }

  const contract = getNodeContract(node.type);
  if (!contract) {
    throw new ValidationError('WORKFLOW_NODE_TYPE_UNSUPPORTED', `不支持的节点类型: ${node.type}`, {
      path: `nodes[${index}].type`,
      nodeId: node.id,
    });
  }

  const position = isPlainObject(node.position) ? node.position : {};
  const data = isPlainObject(node.data) ? node.data : {};
  const ui = isPlainObject(node.ui) ? node.ui : {};

  return {
    id: String(node.id).trim(),
    type: node.type,
    version: Number(node.version) || 1,
    position: {
      x: Number(position.x) || 0,
      y: Number(position.y) || 0,
    },
    data: {
      ...getNodeDataDefaults(node.type),
      ...data,
    },
    ui: {
      ...(typeof ui.width === 'number' ? { width: ui.width } : {}),
      ...(typeof ui.height === 'number' ? { height: ui.height } : {}),
      ...(typeof ui.parentId === 'string' ? { parentId: ui.parentId } : {}),
      ...(typeof ui.extent === 'string' ? { extent: ui.extent } : {}),
    },
  };
}

function normalizeEdge(edge: DynamicValue, index: number, nodeIds: Set<string>) {
  if (!isPlainObject(edge)) {
    throw new ValidationError('VALIDATION_ERROR', `workflow.edges[${index}] 必须为对象`, { path: `edges[${index}]` });
  }
  if (typeof edge.id !== 'string' || !edge.id.trim()) {
    throw new ValidationError('VALIDATION_ERROR', `workflow.edges[${index}].id 不能为空`, {
      path: `edges[${index}].id`,
    });
  }
  if (typeof edge.source !== 'string' || !nodeIds.has(edge.source)) {
    throw new ValidationError('VALIDATION_ERROR', `workflow.edges[${index}].source 引用了不存在的节点`, {
      path: `edges[${index}].source`,
      edgeId: edge.id,
    });
  }
  if (typeof edge.target !== 'string' || !nodeIds.has(edge.target)) {
    throw new ValidationError('VALIDATION_ERROR', `workflow.edges[${index}].target 引用了不存在的节点`, {
      path: `edges[${index}].target`,
      edgeId: edge.id,
    });
  }

  return {
    id: String(edge.id).trim(),
    source: edge.source,
    target: edge.target,
    ...(typeof edge.sourceHandle === 'string' ? { sourceHandle: edge.sourceHandle } : {}),
    ...(typeof edge.targetHandle === 'string' ? { targetHandle: edge.targetHandle } : {}),
  };
}

export function normalizePersistedWorkflow(payload: DynamicValue, options: WorkflowNormalizeOptions = {}) {
  const body = ensureWorkflowBody(payload);
  const id = validateWorkflowId(body.id, 'workflow.id');
  const name = String(body.name || '')
    .trim()
    .slice(0, 200);

  if (!name) throw new ValidationError('VALIDATION_ERROR', 'workflow.name 不能为空', { path: 'name' });
  if (!Array.isArray(body.nodes))
    throw new ValidationError('VALIDATION_ERROR', 'workflow.nodes 必须为数组', { path: 'nodes' });
  if (!Array.isArray(body.edges))
    throw new ValidationError('VALIDATION_ERROR', 'workflow.edges 必须为数组', { path: 'edges' });

  const nodes = body.nodes.map((node, index) => normalizeNode(node, index));
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      throw new ValidationError('VALIDATION_ERROR', `存在重复的节点 ID: ${node.id}`, {
        path: 'nodes',
        nodeId: node.id,
      });
    }
    nodeIds.add(node.id);
  }

  const edges = body.edges.map((edge, index) => normalizeEdge(edge, index, nodeIds));
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      throw new ValidationError('VALIDATION_ERROR', `存在重复的连线 ID: ${edge.id}`, {
        path: 'edges',
        edgeId: edge.id,
      });
    }
    edgeIds.add(edge.id);
  }

  const createdAt = options.preserveCreatedAt === false ? Date.now() : Number(body.createdAt) || Date.now();

  const normalized: PlainObject = {
    id,
    name,
    description: String(body.description || '')
      .trim()
      .slice(0, 4000),
    version: CURRENT_WORKFLOW_SCHEMA_VERSION,
    createdAt,
    updatedAt: Number(options.updatedAt) || Date.now(),
    nodes,
    edges,
    settings: isPlainObject(body.settings) ? body.settings : {},
  };

  if (isPlainObject(body.metadata)) {
    normalized.metadata = body.metadata;
  }

  return ensureResourceOwnership(normalized, {
    ...options.scope,
    userId: body.ownerUserId || body.ownershipScope?.userId || body.scope?.userId || options.scope?.userId,
    workspaceId:
      body.workspaceId || body.ownershipScope?.workspaceId || body.scope?.workspaceId || options.scope?.workspaceId,
    runtimeMode: body.ownershipScope?.runtimeMode || body.scope?.runtimeMode || options.scope?.runtimeMode,
  });
}

export const sanitizeWorkflowPayload = normalizePersistedWorkflow;
