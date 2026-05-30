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

type PortDef = {
  type: string;
  required?: boolean;
};

type NodePortDef = {
  inputs: Record<string, PortDef>;
  outputs: Record<string, PortDef>;
  dynamicInputs?: {
    prefix: string;
    type: string;
    countDataKey: string;
    min: number;
    max: number;
  };
  dynamicOutputs?: {
    prefix: string;
    type: string;
    countDataKey: string;
    min: number;
    max: number;
  };
  dynamicOutputInputs?: {
    prefix: string;
    type: string;
    min: number;
    max: number;
  };
};

const NODE_PORTS: Record<string, NodePortDef> = {
  textInput: { inputs: {}, outputs: { text: { type: 'string' } } },
  imageInput: { inputs: {}, outputs: { image: { type: 'image' }, mask: { type: 'mask' } } },
  maskInput: { inputs: {}, outputs: { mask: { type: 'mask' } } },
  videoInput: { inputs: {}, outputs: { video: { type: 'video' } } },
  audioInput: { inputs: {}, outputs: { audio: { type: 'audio' } } },
  apiKeyInput: { inputs: {}, outputs: { apiKey: { type: 'apiKey' } } },
  aiChat: {
    inputs: {
      prompt: { type: 'string', required: true },
      image: { type: 'image' },
      apiKey: { type: 'apiKey' },
    },
    outputs: { response: { type: 'string' } },
  },
  imageGen: {
    inputs: {
      prompt: { type: 'string', required: true },
      reference: { type: 'image' },
      mask: { type: 'mask' },
      apiKey: { type: 'apiKey' },
    },
    outputs: { images: { type: 'image[]' } },
  },
  videoGen: {
    inputs: {
      prompt: { type: 'string', required: true },
      reference: { type: 'image' },
      video: { type: 'video' },
      audio: { type: 'audio' },
      apiKey: { type: 'apiKey' },
    },
    outputs: { video: { type: 'video' } },
  },
  promptHelper: { inputs: { text: { type: 'string' } }, outputs: { prompt: { type: 'string' } } },
  textClean: { inputs: { text: { type: 'string', required: true } }, outputs: { text: { type: 'string' } } },
  textSplit: {
    inputs: { text: { type: 'string', required: true } },
    outputs: {},
    dynamicOutputs: { prefix: 'part', type: 'string', countDataKey: 'outputCount', min: 1, max: 9 },
  },
  textMerge: {
    inputs: {},
    outputs: { merged: { type: 'string[]' } },
    dynamicInputs: { prefix: 'item', type: 'string', countDataKey: 'inputCount', min: 1, max: 9 },
  },
  imageMerge: {
    inputs: {},
    outputs: { merged: { type: 'image[]' } },
    dynamicInputs: { prefix: 'item', type: 'image', countDataKey: 'inputCount', min: 1, max: 9 },
  },
  videoMerge: {
    inputs: {},
    outputs: { merged: { type: 'video[]' } },
    dynamicInputs: { prefix: 'item', type: 'video', countDataKey: 'inputCount', min: 1, max: 9 },
  },
  audioMerge: {
    inputs: {},
    outputs: { merged: { type: 'audio[]' } },
    dynamicInputs: { prefix: 'item', type: 'audio', countDataKey: 'inputCount', min: 1, max: 9 },
  },
  iterateRun: {
    inputs: {},
    outputs: { text: { type: 'string' } },
    dynamicInputs: { prefix: 'item', type: 'string', countDataKey: 'inputCount', min: 1, max: 9 },
  },
  iterateImageRun: {
    inputs: {},
    outputs: { image: { type: 'image' } },
    dynamicInputs: { prefix: 'item', type: 'image', countDataKey: 'inputCount', min: 1, max: 9 },
  },
  imageResize: { inputs: { image: { type: 'image', required: true } }, outputs: { image: { type: 'image' } } },
  imageCompare: {
    inputs: {
      image1: { type: 'image', required: true },
      image2: { type: 'image', required: true },
    },
    outputs: {},
  },
  saveFile: { inputs: { content: { type: 'any', required: true } }, outputs: { content: { type: 'any' } } },
  output: {
    inputs: { content: { type: 'any', required: true } },
    outputs: {},
    dynamicOutputInputs: { prefix: 'content', type: 'any', min: 1, max: 9 },
  },
};

function clampInteger(value: DynamicValue, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function readDynamicHandleIndex(handleId: string, prefix: string) {
  if (handleId === prefix) return 1;
  const matched = handleId.match(new RegExp(`^${prefix}(\\d+)$`));
  if (!matched) return null;
  const index = Number(matched[1]);
  return Number.isInteger(index) ? index : null;
}

function getInputPort(node: PlainObject, handleId: string): PortDef | null {
  const def = NODE_PORTS[String(node.type || '')];
  if (!def) return null;
  if (def.inputs[handleId]) return def.inputs[handleId];
  if (def.dynamicInputs) {
    const index = readDynamicHandleIndex(handleId, def.dynamicInputs.prefix);
    if (index !== null && index >= def.dynamicInputs.min && index <= def.dynamicInputs.max) return { type: def.dynamicInputs.type };
  }
  if (def.dynamicOutputInputs) {
    const index = readDynamicHandleIndex(handleId, def.dynamicOutputInputs.prefix);
    if (index !== null && index >= def.dynamicOutputInputs.min && index <= def.dynamicOutputInputs.max) {
      return { type: def.dynamicOutputInputs.type, required: index === 1 };
    }
  }
  return null;
}

function getOutputPort(node: PlainObject, handleId: string): PortDef | null {
  const def = NODE_PORTS[String(node.type || '')];
  if (!def) return null;
  if (def.outputs[handleId]) return def.outputs[handleId];
  if (def.dynamicOutputs) {
    const index = readDynamicHandleIndex(handleId, def.dynamicOutputs.prefix);
    const count = clampInteger(node.data?.[def.dynamicOutputs.countDataKey], def.dynamicOutputs.min, def.dynamicOutputs.min, def.dynamicOutputs.max);
    if (index !== null && index >= 1 && index <= count) return { type: def.dynamicOutputs.type };
  }
  return null;
}

function getRequiredInputHandles(node: PlainObject) {
  const def = NODE_PORTS[String(node.type || '')];
  if (!def) return [];
  const handles = Object.entries(def.inputs)
    .filter(([, port]) => port.required)
    .map(([handle]) => handle);
  if (def.dynamicOutputInputs) handles.push(def.dynamicOutputInputs.prefix);
  return handles;
}

function hasLocalInputValue(node: PlainObject, handleId: string) {
  const value = node.data?.[handleId];
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null && value !== false;
}

function normalizeType(type: string) {
  return type.replace(/\[\]$/, '');
}

function arePortTypesCompatible(sourceType: string, targetType: string) {
  if (sourceType === 'any' || targetType === 'any') return true;
  if (sourceType === targetType) return true;
  return normalizeType(sourceType) === normalizeType(targetType);
}

function pushIssue(
  issues: WorkflowValidationIssue[],
  issue: Omit<WorkflowValidationIssue, 'severity'> & { severity?: WorkflowValidationIssue['severity'] },
) {
  issues.push({
    severity: issue.severity || 'error',
    ...issue,
  });
}

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
  const nodeMap = new Map(nodes.map((node) => [String(node.id || ''), node]));

  for (const edge of edges) {
    const edgeId = String(edge.id || '');
    const sourceId = String(edge.source || '');
    const targetId = String(edge.target || '');
    const sourceHandle = String(edge.sourceHandle || '');
    const targetHandle = String(edge.targetHandle || '');
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    if (!sourceNode) {
      pushIssue(issues, {
        code: 'EDGE_SOURCE_MISSING',
        message: `边 ${edgeId} 的源节点 ${sourceId} 不存在。`,
        edgeId,
      });
      continue;
    }
    if (!targetNode) {
      pushIssue(issues, {
        code: 'EDGE_TARGET_MISSING',
        message: `边 ${edgeId} 的目标节点 ${targetId} 不存在。`,
        edgeId,
      });
      continue;
    }
    const sourcePort = getOutputPort(sourceNode, sourceHandle);
    if (!sourcePort) {
      pushIssue(issues, {
        code: 'EDGE_SOURCE_HANDLE_INVALID',
        message: `节点 ${sourceId} 没有可用输出端口 ${sourceHandle}。`,
        nodeId: sourceId,
        edgeId,
      });
      continue;
    }
    const targetPort = getInputPort(targetNode, targetHandle);
    if (!targetPort) {
      pushIssue(issues, {
        code: 'EDGE_TARGET_HANDLE_INVALID',
        message: `节点 ${targetId} 没有可用输入端口 ${targetHandle}。`,
        nodeId: targetId,
        edgeId,
      });
      continue;
    }
    if (!arePortTypesCompatible(sourcePort.type, targetPort.type)) {
      pushIssue(issues, {
        code: 'EDGE_PORT_TYPE_MISMATCH',
        message: `边 ${edgeId} 类型不匹配：${sourceId}.${sourceHandle}(${sourcePort.type}) 不能连接到 ${targetId}.${targetHandle}(${targetPort.type})。`,
        edgeId,
      });
    }
  }

  for (const node of nodes) {
    const nodeId = String(node.id || '');
    if (!NODE_PORTS[String(node.type || '')]) {
      pushIssue(issues, {
        code: 'NODE_TYPE_UNSUPPORTED',
        message: `节点 ${nodeId} 的类型 ${String(node.type || '')} 不在工作流校验目录中。`,
        nodeId,
      });
      continue;
    }
    for (const handleId of getRequiredInputHandles(node)) {
      const hasIncoming = edges.some((edge) => String(edge.target || '') === nodeId && String(edge.targetHandle || '') === handleId);
      if (!hasIncoming && !hasLocalInputValue(node, handleId)) {
        pushIssue(issues, {
          code: 'REQUIRED_INPUT_MISSING',
          message: `节点 ${nodeId} 缺少必需输入端口 ${handleId}。`,
          nodeId,
        });
      }
    }
  }

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
    nodes.filter((node) => ['imageInput', 'textInput', 'maskInput', 'videoInput', 'audioInput'].includes(String(node.type))).map((node) => String(node.id || '')),
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

  const outputNodes = nodes.filter((node) => String(node.type || '') === 'output');
  if (outputNodes.length === 0) {
    pushIssue(issues, {
      code: 'OUTPUT_NODE_MISSING',
      message: '工作流缺少最终 output 节点。',
    });
  }
  for (const node of outputNodes) {
    const nodeId = String(node.id || '');
    const hasIncoming = edges.some((edge) => String(edge.target || '') === nodeId);
    if (!hasIncoming) {
      pushIssue(issues, {
        code: 'OUTPUT_DISCONNECTED',
        message: `输出节点 ${nodeId} 没有接收任何结果。`,
        nodeId,
      });
    }
  }

  for (const node of nodes) {
    const nodeId = String(node.id || '');
    const type = String(node.type || '');
    if (type.endsWith('Input') || type === 'output') continue;
    const def = NODE_PORTS[type];
    const hasInputs = Boolean(def && (Object.keys(def.inputs).length > 0 || def.dynamicInputs));
    const hasOutputs = Boolean(def && (Object.keys(def.outputs).length > 0 || def.dynamicOutputs));
    const hasIncoming = edges.some((edge) => String(edge.target || '') === nodeId);
    const hasOutgoing = edges.some((edge) => String(edge.source || '') === nodeId);
    if (hasInputs && !hasIncoming && !getRequiredInputHandles(node).some((handleId) => hasLocalInputValue(node, handleId))) {
      pushIssue(issues, {
        code: 'NODE_INPUTS_DISCONNECTED',
        message: `节点 ${nodeId} 没有接收上游输入。`,
        severity: 'warning',
        nodeId,
      });
    }
    if (hasOutputs && !hasOutgoing) {
      pushIssue(issues, {
        code: 'NODE_OUTPUTS_DISCONNECTED',
        message: `节点 ${nodeId} 的输出没有连接到下游。`,
        severity: 'warning',
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
