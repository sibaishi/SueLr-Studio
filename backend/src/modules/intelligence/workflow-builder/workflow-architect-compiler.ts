import {
  getWorkflowArchitectDefaultData,
  getWorkflowArchitectVariableInputNodeTypes,
  getWorkflowArchitectVariableOutputNodeTypes,
  getWorkflowValidationNodePortDef,
} from '../../../../../src/shared/workflow/node-catalog.js';
import type { DynamicValue, PlainObject } from '../../types.ts';
import { normalizePersistedWorkflow } from '../../workflows/workflows.schema.ts';
import { type WorkflowArchitectDsl, workflowArchitectDslSchema } from './workflow-architect.schema.ts';
import type { WorkflowDraft } from './workflow-draft.schema.ts';
import type { WorkflowIntent } from './workflow-intent.schema.ts';

const VARIABLE_INPUT_NODE_TYPES = new Set(getWorkflowArchitectVariableInputNodeTypes());
const VARIABLE_OUTPUT_NODE_TYPES = new Set(getWorkflowArchitectVariableOutputNodeTypes());

function clampInteger(value: DynamicValue, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function inferInputCount(nodeType: string, data: PlainObject, edges: WorkflowArchitectDsl['edges']) {
  if (!VARIABLE_INPUT_NODE_TYPES.has(nodeType)) return data.inputCount;
  const countFromEdges = edges
    .filter((edge) => edge.target === data.id && edge.targetHandle.startsWith('item'))
    .reduce((max, edge) => {
      const matched = edge.targetHandle.match(/(\d+)$/);
      return Math.max(max, matched ? Number(matched[1]) : 1);
    }, 1);
  return Math.max(clampInteger(data.inputCount, 1, 1, 9), countFromEdges);
}

function normalizeNodeData(node: WorkflowArchitectDsl['nodes'][number], edges: WorkflowArchitectDsl['edges']) {
  const base = getWorkflowArchitectDefaultData(node.type);
  const data = { ...base, ...(node.data || {}) };
  if (node.type === 'textInput' && typeof data.text !== 'string') data.text = '';
  if (node.type === 'aiChat') {
    data.model = typeof data.model === 'string' ? data.model : '';
    data.temperature = Number.isFinite(Number(data.temperature)) ? Number(data.temperature) : 0.7;
    data.maxTokens = clampInteger(data.maxTokens, 4096, 1, 32000);
    data.systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt : '';
  }
  if (node.type === 'imageGen') {
    data.model = typeof data.model === 'string' ? data.model : '';
    data.n = clampInteger(data.n, 1, 1, 8);
    data.output_format = typeof data.output_format === 'string' ? data.output_format : 'png';
  }
  if (node.type === 'videoGen') {
    data.model = typeof data.model === 'string' ? data.model : '';
    data.duration = clampInteger(data.duration, 5, 1, 30);
  }
  if (node.type === 'imageSplit') {
    data.rows = clampInteger(data.rows, 3, 1, 3);
    data.columns = clampInteger(data.columns, 3, 1, 3);
  }
  if (VARIABLE_INPUT_NODE_TYPES.has(node.type)) {
    data.inputCount = inferInputCount(node.type, { ...data, id: node.id }, edges);
  }
  const dynamicOutputs = getWorkflowValidationNodePortDef(node.type)?.dynamicOutputs;
  if (VARIABLE_OUTPUT_NODE_TYPES.has(node.type) && dynamicOutputs?.countDataKey) {
    const defaultCount = Number(base[dynamicOutputs.countDataKey]);
    data[dynamicOutputs.countDataKey] = clampInteger(
      data[dynamicOutputs.countDataKey],
      Number.isFinite(defaultCount) ? defaultCount : dynamicOutputs.min,
      dynamicOutputs.min,
      dynamicOutputs.max,
    );
  }
  return data;
}

function getNodePosition(index: number, provided?: { x: number; y: number }) {
  if (provided) {
    return {
      x: Math.round(provided.x),
      y: Math.round(provided.y),
    };
  }
  const column = index % 5;
  const row = Math.floor(index / 5);
  return {
    x: 80 + column * 360,
    y: 120 + row * 260,
  };
}

function buildMetadata(intent: WorkflowIntent, draft: WorkflowDraft, dsl: WorkflowArchitectDsl) {
  return {
    source: 'intelligence.workflowArchitectDsl',
    intentId: intent.id,
    intentDomain: intent.domain,
    draftId: draft.id,
    approvalsRequired: draft.approvalsRequired,
    architect: {
      source: 'llm',
      reasoningSummary: dsl.reasoningSummary || '',
      warnings: dsl.warnings || [],
    },
  };
}

export function compileWorkflowArchitectDsl(
  rawDsl: DynamicValue,
  intent: WorkflowIntent,
  draft: WorkflowDraft,
  options: { scope?: DynamicValue } = {},
) {
  const parsed = workflowArchitectDslSchema.parse(rawDsl);
  const nodeIds = new Set(parsed.nodes.map((node) => node.id));
  const validEdges = parsed.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const nodes = parsed.nodes.map((item, index) => ({
    id: item.id,
    type: item.type,
    version: 1,
    position: getNodePosition(index, item.position),
    data: normalizeNodeData(item, validEdges),
  }));
  const edges = validEdges.map((item, index) => ({
    id: item.id || `${item.source}-${item.sourceHandle}-to-${item.target}-${item.targetHandle}-${index + 1}`,
    source: item.source,
    sourceHandle: item.sourceHandle,
    target: item.target,
    targetHandle: item.targetHandle,
  }));

  return normalizePersistedWorkflow(
    {
      id: `draft_${draft.id}`,
      name: parsed.name || draft.name,
      description: [
        parsed.description || draft.description,
        parsed.reasoningSummary ? `Architect：${parsed.reasoningSummary}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      nodes,
      edges,
      settings: parsed.settings || {},
      metadata: buildMetadata(intent, draft, parsed),
    },
    { preserveCreatedAt: false, scope: options.scope },
  );
}
