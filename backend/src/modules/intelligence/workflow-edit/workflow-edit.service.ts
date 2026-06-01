import { createHash } from 'node:crypto';
import { ValidationError } from '../../../app/errors/index.ts';
import type { DynamicValue, PlainObject } from '../../types.ts';
import { workflowsService } from '../../workflows/workflows.service.ts';
import { validateCompiledWorkflow } from '../workflow-builder/workflow-validator.ts';

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value: DynamicValue, maxLength = 12000) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function cloneObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseChineseNumber(value: string) {
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  return map[value] || null;
}

function extractRequestedCount(instruction: string) {
  const arabic = instruction.match(/(\d+)\s*[张个份套幅]/);
  if (arabic) return Math.max(1, Math.min(9, Number(arabic[1]) || 1));
  const chinese = instruction.match(/([一二两三四五六七八九])\s*[张个份套幅]/);
  if (chinese) return parseChineseNumber(chinese[1]);
  return null;
}

function extractRequestedRatio(instruction: string) {
  const text = instruction.toLowerCase();
  if (text.includes('16:9') || text.includes('横版') || text.includes('横屏')) return '16:9';
  if (text.includes('9:16') || text.includes('竖版') || text.includes('竖屏')) return '9:16';
  if (text.includes('1:1') || text.includes('方图') || text.includes('方版')) return '1:1';
  return null;
}

function extractRequestedFormat(instruction: string) {
  const text = instruction.toLowerCase();
  if (text.includes('png')) return 'png';
  if (text.includes('jpg') || text.includes('jpeg')) return 'jpeg';
  if (text.includes('webp')) return 'webp';
  return null;
}

function extractRequestedName(instruction: string) {
  const matched = instruction.match(/(?:改名|命名|重命名)(?:为|成)?[：:\s"'“”]*(.+?)["'“”]*$/);
  if (!matched) return '';
  return cleanText(matched[1], 200);
}

function normalizeWorkflowLike(value: DynamicValue) {
  if (!isPlainObject(value)) return null;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return null;
  const id = cleanText(value.id, 120);
  const name = cleanText(value.name, 200);
  if (!id || !name) return null;
  return cloneObject(value);
}

function resolveWorkflowSnapshot(input: PlainObject, scope?: DynamicValue) {
  const workflowSnapshot = normalizeWorkflowLike(input.workflowSnapshot);
  if (workflowSnapshot) return workflowSnapshot;

  const workflowId = cleanText(input.workflowId, 120);
  if (workflowId) return workflowsService.getById(workflowId, { scope });

  const workflowName = cleanText(input.workflowName, 200).toLowerCase();
  if (!workflowName) return null;
  const matched = workflowsService
    .list({ scope })
    .find((workflow) => cleanText((workflow as PlainObject).name, 200).toLowerCase() === workflowName);
  return matched ? workflowsService.getById(cleanText((matched as PlainObject).id, 120), { scope }) : null;
}

function computeWorkflowSignature(workflow: PlainObject) {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: workflow.id,
        name: workflow.name,
        nodes: nodes.map((node) => ({
          id: (node as PlainObject).id,
          type: (node as PlainObject).type,
          position: (node as PlainObject).position,
          data: (node as PlainObject).data,
          ui: (node as PlainObject).ui,
        })),
        edges: edges.map((edge) => ({
          id: (edge as PlainObject).id,
          source: (edge as PlainObject).source,
          sourceHandle: (edge as PlainObject).sourceHandle,
          target: (edge as PlainObject).target,
          targetHandle: (edge as PlainObject).targetHandle,
        })),
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

function summarizeWorkflowCanvas(workflow: PlainObject | null) {
  if (!workflow) return null;
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow.edges) ? workflow.edges : [];
  const nodeTypeCounts = new Map<string, number>();

  for (const rawNode of nodes) {
    const node = rawNode as PlainObject;
    const type = cleanText(node.type, 80) || 'unknown';
    nodeTypeCounts.set(type, (nodeTypeCounts.get(type) || 0) + 1);
  }

  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    signature: computeWorkflowSignature(workflow),
    nodeTypes: Array.from(nodeTypeCounts.entries()).map(([type, count]) => ({ type, count })),
    inputNodes: nodes
      .filter((rawNode) =>
        ['textInput', 'imageInput', 'videoInput', 'audioInput', 'maskInput'].includes(
          cleanText((rawNode as PlainObject).type, 80),
        ),
      )
      .map((rawNode, index) => {
        const node = rawNode as PlainObject;
        const data = isPlainObject(node.data) ? node.data : {};
        return {
          nodeId: cleanText(node.id, 120),
          nodeType: cleanText(node.type, 80),
          label: cleanText(data.label, 200) || cleanText(node.id, 120) || `输入 ${index + 1}`,
        };
      }),
    nodes: nodes.slice(0, 24).map((rawNode) => {
      const node = rawNode as PlainObject;
      const data = isPlainObject(node.data) ? node.data : {};
      return {
        id: cleanText(node.id, 120),
        type: cleanText(node.type, 80),
        label: cleanText(data.label, 200) || cleanText(node.id, 120),
        position: isPlainObject(node.position) ? node.position : { x: 0, y: 0 },
        dataKeys: Object.keys(data).slice(0, 12),
      };
    }),
    edges: edges.slice(0, 24).map((rawEdge) => {
      const edge = rawEdge as PlainObject;
      return {
        id: cleanText(edge.id, 120),
        source: cleanText(edge.source, 120),
        sourceHandle: cleanText(edge.sourceHandle, 120),
        target: cleanText(edge.target, 120),
        targetHandle: cleanText(edge.targetHandle, 120),
      };
    }),
  };
}

function updateNodeField(
  node: PlainObject,
  field: string,
  nextValue: unknown,
  operations: PlainObject[],
  summary: string,
) {
  const data = isPlainObject(node.data) ? node.data : {};
  if (data[field] === nextValue) return false;
  operations.push({
    type: 'updateNodeData',
    nodeId: cleanText(node.id, 120),
    nodeType: cleanText(node.type, 80),
    field,
    from: data[field],
    to: nextValue,
    summary,
  });
  node.data = {
    ...data,
    [field]: nextValue,
  };
  return true;
}

function buildEditPatchFromInstruction(workflow: PlainObject, instruction: string) {
  const nextWorkflow = cloneObject(workflow);
  const operations: PlainObject[] = [];
  const warnings: string[] = [];
  const requestedName = extractRequestedName(instruction);
  const requestedCount = extractRequestedCount(instruction);
  const requestedRatio = extractRequestedRatio(instruction);
  const requestedFormat = extractRequestedFormat(instruction);
  const nodes = Array.isArray(nextWorkflow.nodes) ? (nextWorkflow.nodes as PlainObject[]) : [];

  if (requestedName && requestedName !== cleanText(nextWorkflow.name, 200)) {
    operations.push({
      type: 'renameWorkflow',
      from: cleanText(nextWorkflow.name, 200),
      to: requestedName,
      summary: `将工作流重命名为「${requestedName}」`,
    });
    nextWorkflow.name = requestedName;
  }

  if (requestedCount !== null) {
    let changed = false;
    for (const node of nodes.filter((item) => cleanText(item.type, 80) === 'imageGen')) {
      changed = updateNodeField(node, 'n', requestedCount, operations, `调整图片生成数量为 ${requestedCount}`) || changed;
    }
    for (const node of nodes.filter((item) => cleanText(item.type, 80) === 'textSplit')) {
      changed =
        updateNodeField(node, 'outputCount', requestedCount, operations, `调整拆分输出数量为 ${requestedCount}`) ||
        changed;
    }
    if (!changed) {
      warnings.push(`识别到“${requestedCount} 张”的数量要求，但当前工作流里没有可安全调整的 imageGen 或 textSplit 节点。`);
    }
  }

  if (requestedRatio) {
    let changed = false;
    for (const node of nodes.filter((item) => ['imageGen', 'videoGen'].includes(cleanText(item.type, 80)))) {
      changed = updateNodeField(node, 'ratio', requestedRatio, operations, `调整输出比例为 ${requestedRatio}`) || changed;
    }
    if (!changed) warnings.push(`识别到“${requestedRatio}”比例要求，但当前工作流里没有可安全调整比例的生成节点。`);
  }

  if (requestedFormat) {
    let changed = false;
    for (const node of nodes.filter((item) => cleanText(item.type, 80) === 'imageGen')) {
      changed =
        updateNodeField(node, 'output_format', requestedFormat, operations, `调整图片输出格式为 ${requestedFormat}`) ||
        changed;
    }
    if (!changed) warnings.push(`识别到“${requestedFormat}”格式要求，但当前工作流里没有 imageGen 节点可调整输出格式。`);
  }

  if (operations.length === 0) {
    warnings.push('暂未识别出可安全自动应用的结构化修改；请更具体说明数量、比例、格式或命名要求。');
  }

  return {
    workflow: nextWorkflow,
    operations,
    warnings,
  };
}

function normalizePatch(value: DynamicValue) {
  if (!isPlainObject(value)) return null;
  const workflow = normalizeWorkflowLike(value.workflow);
  if (!workflow) return null;
  const operations = Array.isArray(value.operations) ? value.operations : [];
  return {
    id: cleanText(value.id, 120),
    workflowId: cleanText(value.workflowId, 120) || cleanText(workflow.id, 120),
    workflowName: cleanText(value.workflowName, 200) || cleanText(workflow.name, 200),
    instruction: cleanText(value.instruction, 12000),
    summary: cleanText(value.summary, 500),
    baseSignature: cleanText(value.baseSignature, 120),
    approvalsRequired: Array.isArray(value.approvalsRequired) ? value.approvalsRequired : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.map((item) => cleanText(item, 240)).filter(Boolean) : [],
    operations,
    workflow,
    validation: isPlainObject(value.validation)
      ? {
          valid: value.validation.valid === true,
          issues: Array.isArray(value.validation.issues) ? value.validation.issues : [],
        }
      : null,
  };
}

export class WorkflowEditService {
  inspect(input: PlainObject, options: { scope?: DynamicValue } = {}) {
    const workflow = resolveWorkflowSnapshot(input, options.scope);
    return {
      workflow: summarizeWorkflowCanvas(workflow),
      note: workflow ? '已读取当前工作流画布摘要。' : '请先打开当前工作流画布，或提供 workflowId / workflowName。',
    };
  }

  edit(input: PlainObject, options: { scope?: DynamicValue } = {}) {
    const workflow = resolveWorkflowSnapshot(input, options.scope);
    if (!workflow) {
      return {
        workflow: null,
        patch: null,
        note: '请先打开当前工作流画布，或提供 workflowId / workflowName。',
      };
    }

    const instruction = cleanText(input.input, 12000);
    const patchDraft = buildEditPatchFromInstruction(workflow, instruction);
    const validation = validateCompiledWorkflow(patchDraft.workflow, { scope: options.scope });
    const validatedWorkflow = validation.workflow || patchDraft.workflow;
    const operationCount = patchDraft.operations.length;

    return {
      workflow: summarizeWorkflowCanvas(workflow),
      patch: {
        id: `patch_${Date.now().toString(36)}`,
        workflowId: cleanText(workflow.id, 120),
        workflowName: cleanText(validatedWorkflow.name, 200),
        instruction,
        summary:
          operationCount > 0
            ? `已生成 ${operationCount} 项可预览修改，确认后可应用到当前画布。`
            : '已检查当前工作流，但还没有识别出可安全自动应用的修改。',
        baseSignature: computeWorkflowSignature(workflow),
        approvalsRequired: ['applyDraft'],
        warnings: patchDraft.warnings,
        operations: patchDraft.operations,
        workflow: validatedWorkflow,
        validation: {
          valid: validation.valid,
          issues: validation.issues,
        },
      },
      note: operationCount > 0 ? '请先预览 patch，再决定是否应用。' : '请补充更具体的修改要求。',
    };
  }

  applyDraft(input: PlainObject, options: { scope?: DynamicValue } = {}) {
    const patch = normalizePatch(input.patch || input.workflowEditPatch);
    if (!patch) {
      return {
        approvalRequired: false,
        applied: false,
        workflow: null,
        patch: null,
        message: '当前没有可应用的工作流修改草案，请先生成修改预览。',
      };
    }

    const currentWorkflow = resolveWorkflowSnapshot(input, options.scope);
    if (!currentWorkflow) {
      return {
        approvalRequired: false,
        applied: false,
        workflow: null,
        patch,
        message: '当前没有可用的工作流画布上下文，请重新打开画布后再应用。',
      };
    }

    if (cleanText(currentWorkflow.id, 120) !== patch.workflowId) {
      throw new ValidationError('WORKFLOW_PATCH_TARGET_MISMATCH', '当前修改草案不属于这个工作流，请重新生成。');
    }

    const currentSignature = computeWorkflowSignature(currentWorkflow);
    if (patch.baseSignature && patch.baseSignature !== currentSignature) {
      throw new ValidationError('WORKFLOW_PATCH_STALE', '当前画布已变化，请重新生成修改草案后再应用。');
    }

    const validation = validateCompiledWorkflow(patch.workflow, { scope: options.scope });
    const validatedWorkflow = validation.workflow || patch.workflow;
    const hydratedPatch = {
      ...patch,
      workflow: validatedWorkflow,
      validation: {
        valid: validation.valid,
        issues: validation.issues,
      },
    };

    if (input.confirmed !== true) {
      return {
        approvalRequired: true,
        approvalCode: 'applyWorkflowDraft',
        message: '应用工作流修改草案需要用户确认。确认后才会把 patch 应用到当前画布。',
        workflow: summarizeWorkflowCanvas(currentWorkflow),
        patch: hydratedPatch,
      };
    }

    return {
      approvalRequired: false,
      applied: true,
      workflow: validatedWorkflow,
      patch: hydratedPatch,
      validation: {
        valid: validation.valid,
        issues: validation.issues,
      },
      message: validation.valid ? '已将修改草案应用到当前画布。' : '已应用修改草案，但校验提示仍需继续检查。',
    };
  }
}

export const workflowEditService = new WorkflowEditService();
