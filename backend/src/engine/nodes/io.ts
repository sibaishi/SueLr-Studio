import { materializeContentForOutput } from '../helpers/saveHelper.ts';
import type { NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

const AI_NODE_TYPES = /^(aiV3|imageGenV2|videoGenV2|aiChatV2)$/;

function isFromAi(types: unknown, idx: number): boolean {
  if (!Array.isArray(types)) return false;
  const t = types[idx];
  return typeof t === 'string' && AI_NODE_TYPES.test(t);
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const upstreamValue = inputs.input;
  const hasUpstream = upstreamValue !== undefined && upstreamValue !== null;

  if (hasUpstream) {
    const sourceTypes: unknown = (inputs as Record<string, unknown>)._inputTypes;
    sendProgress?.('正在接收上游数据...');

    if (Array.isArray(upstreamValue) && Array.isArray(sourceTypes)) {
      // Multi-input: only save AI-generated items to disk; pass others through as-is
      const aiItems: unknown[] = [];
      const nonAiItems: unknown[] = [];
      const results: unknown[] = [];
      for (let i = 0; i < upstreamValue.length; i++) {
        if (isFromAi(sourceTypes, i)) {
          aiItems.push(upstreamValue[i]);
        } else {
          nonAiItems.push(upstreamValue[i]);
        }
      }
      // Save AI items to disk
      let savedResult = { content: aiItems as string[] | string, savedFiles: [] as unknown[], savedPaths: [] as string[] };
      if (aiItems.length > 0) {
        sendProgress?.('正在保存 AI 生成内容...');
        const raw = aiItems.length === 1 ? aiItems[0] : aiItems;
        savedResult = await materializeContentForOutput(raw, { prefix: 'io', scope: apiConfig.scope });
      }
      // Merge: AI items replaced with saved URLs, non-AI items pass through in-place
      let aiIdx = 0;
      const aiResult = Array.isArray(savedResult.content) ? savedResult.content : [savedResult.content];
      for (let i = 0; i < upstreamValue.length; i++) {
        if (isFromAi(sourceTypes, i)) {
          results.push(aiResult[aiIdx++] ?? upstreamValue[i]);
        } else {
          results.push(upstreamValue[i]);
        }
      }
      return {
        result: results.length === 1 ? results[0] : results,
        savedFiles: savedResult.savedFiles,
        savedPaths: savedResult.savedPaths,
      };
    }

    // Single input or no type info
    const singleType = Array.isArray(sourceTypes) ? sourceTypes[0] : undefined;
    const isAi = typeof singleType === 'string' && AI_NODE_TYPES.test(singleType);

    if (isAi) {
      sendProgress?.('正在保存并展示...');
      const result = await materializeContentForOutput(upstreamValue, {
        prefix: 'io',
        scope: apiConfig.scope,
      });
      return {
        result: result.content ?? upstreamValue,
        savedFiles: result.savedFiles,
        savedPaths: result.savedPaths,
      };
    }

    // Non-AI upstream: pass through without saving
    sendProgress?.('正在展示...');
    return { result: upstreamValue };
  }

  // No upstream: serve own content (prefer _rawContent for execution, fallback to content)
  const nodeData = (node.data || {}) as Record<string, unknown>;
  const selfContent = nodeData._rawContent ?? nodeData.content;
  if (selfContent !== undefined && selfContent !== null) {
    return { result: selfContent };
  }

  return { result: null };
}
