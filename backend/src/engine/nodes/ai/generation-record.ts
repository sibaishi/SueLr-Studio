import {
  GENERATION_PARAMETER_KEYS,
  type GenerationRecord,
  type GenerationReference,
} from '../../../../../src/shared/types/generation.ts';
import { type GenerationRecords, generationValueKey } from '../../../platform/media/output-generation.ts';
import type { RuntimeApiConfig } from '../types.ts';

/** 仅从允许的生成参数构建快照，绝不持久化运行时 API 配置。 */
export function recordGenerationResult<T extends { result: unknown }>(
  result: T,
  request: Record<string, unknown>,
  references: GenerationReference[],
  nodeData: Record<string, unknown>,
  apiConfig: RuntimeApiConfig,
): T {
  const records = apiConfig.generationRecords as GenerationRecords | undefined;
  if (!records) return result;
  const parameters: GenerationRecord['parameters'] = {};
  for (const key of GENERATION_PARAMETER_KEYS) {
    const value = request[key];
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      parameters[key] = value;
  }
  parameters.model = String(nodeData.model || request.model || '');
  const record: GenerationRecord = {
    version: 1,
    runId: String(apiConfig.runId || ''),
    workflowId: String(apiConfig.generationWorkflowId || ''),
    nodeId: String(apiConfig.generationNodeId || ''),
    createdAt: Date.now(),
    prompt: String(request.prompt || ''),
    references: references.filter(
      (reference) =>
        typeof reference.url === 'string' && /^(\/api\/|https?:\/\/|data:(image|video|audio)\/)/.test(reference.url),
    ),
    parameters,
  };
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'string') return;
    const key = generationValueKey(value);
    const previous = records.get(key);
    // 内容相同而来源不同，宁可不归属，也不把别的节点的提示词挂到结果上。
    records.set(key, records.has(key) && (!previous || previous.nodeId !== record.nodeId) ? null : record);
  };
  visit(result.result);
  return result;
}
