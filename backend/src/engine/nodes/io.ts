import { materializeContentForOutput } from '../helpers/saveHelper.ts';
import type { NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

const AI_NODE_TYPES = /^(aiV3|imageGenV2|videoGenV2|aiChatV2)$/;

type IoResult = { result: unknown; savedFiles: unknown[]; savedPaths: string[] };

function resolveSourceType(types: unknown[], idx: number): unknown {
  // When upstream data is a single array from one source node, sourceTypes has
  // one entry but the data array may have many items. Use index 0 for all items
  // so multi-image outputs from a single AI node are all recognised as AI content.
  return types.length === 1 ? types[0] : types[idx];
}

function isFromAi(types: unknown, idx: number): boolean {
  if (!Array.isArray(types)) return false;
  const t = resolveSourceType(types, idx);
  return typeof t === 'string' && AI_NODE_TYPES.test(t);
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  sendProgress: ProgressCallback,
) {
  const nodeData = (node.data || {}) as Record<string, unknown>;

  const finalize = (partial: { result: unknown; savedFiles?: unknown[]; savedPaths?: string[] }): IoResult => ({
    result: partial.result,
    savedFiles: partial.savedFiles || [],
    savedPaths: partial.savedPaths || [],
  });

  // _rawContent (pre-assembled upstream data in per-type order) takes priority
  // over live upstream inputs — enables per-type independent ordering.
  // _rawContentSourceTypes (set by frontend) marks each item's origin node type,
  // so only AI-generated items are materialized to disk; non-AI passthrough as-is.
  if (nodeData._rawContent !== undefined && nodeData._rawContent !== null) {
    // When live upstream includes sources not covered by _rawContent's
    // source types, _rawContent is incomplete — skip it and use live upstream.
    const liveTypes = (inputs as Record<string, unknown>)._inputTypes;
    const rawSourceTypes = nodeData._rawContentSourceTypes as string[] | undefined;
    const rawIsIncomplete =
      Array.isArray(liveTypes) &&
      Array.isArray(rawSourceTypes) &&
      liveTypes.some((t) => typeof t === 'string' && !new Set(rawSourceTypes).has(t));

    if (!rawIsIncomplete) {
      const raw = nodeData._rawContent;
      const rawSourceTypes = nodeData._rawContentSourceTypes as string[] | undefined;

      // Per-item type info available: split AI / non-AI precisely
      if (Array.isArray(rawSourceTypes)) {
        const rawItems: unknown[] = Array.isArray(raw) ? raw : [raw];
        if (rawSourceTypes.length !== rawItems.length) {
          // Mismatched lengths — fall through to aggregate check below
        } else {
          const aiItems: unknown[] = [];
          const results: unknown[] = [];
          for (let i = 0; i < rawItems.length; i++) {
            if (typeof rawSourceTypes[i] === 'string' && AI_NODE_TYPES.test(rawSourceTypes[i])) {
              aiItems.push(rawItems[i]);
            }
          }

          if (aiItems.length > 0) {
            sendProgress?.('正在保存...');
            const savedResult = await materializeContentForOutput(aiItems.length === 1 ? aiItems[0] : aiItems, {
              prefix: 'io',
              scope: apiConfig.scope,
            });
            // Rebuild result in original order: AI items → saved URLs, others → passthrough
            let aiIdx = 0;
            const aiResult = Array.isArray(savedResult.content) ? savedResult.content : [savedResult.content];
            for (let i = 0; i < rawItems.length; i++) {
              if (typeof rawSourceTypes[i] === 'string' && AI_NODE_TYPES.test(rawSourceTypes[i])) {
                results.push(aiResult[aiIdx++] ?? rawItems[i]);
              } else {
                results.push(rawItems[i]);
              }
            }
            return finalize({
              result: results.length === 1 ? results[0] : results,
              savedFiles: savedResult.savedFiles,
              savedPaths: savedResult.savedPaths || [],
            });
          }

          // No AI items at all — pass through without saving
          sendProgress?.('正在展示...');
          return finalize({ result: raw });
        }
      }

      // Fallback: no per-item type info — check aggregate _inputTypes
      const sourceTypes: unknown = (inputs as Record<string, unknown>)._inputTypes;
      const hasAiSource =
        Array.isArray(sourceTypes) && sourceTypes.some((t) => typeof t === 'string' && AI_NODE_TYPES.test(t));
      if (!hasAiSource) {
        sendProgress?.('正在展示...');
        return finalize({ result: raw });
      }
      sendProgress?.('正在保存...');
      const rawSaveResult = await materializeContentForOutput(raw, { prefix: 'io', scope: apiConfig.scope });
      return finalize({
        result: rawSaveResult.content ?? raw,
        savedFiles: rawSaveResult.savedFiles,
        savedPaths: rawSaveResult.savedPaths || [],
      });
    } // !rawIsIncomplete
  }

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
      let savedResult: { content: unknown; savedFiles: unknown[]; savedPaths?: string[] } = {
        content: aiItems,
        savedFiles: [],
        savedPaths: [],
      };
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
      const outputResult = results.length === 1 ? results[0] : results;
      return finalize({
        result: outputResult,
        savedFiles: savedResult.savedFiles,
        savedPaths: savedResult.savedPaths || [],
      });
    }

    // Single input or no type info
    const singleType = Array.isArray(sourceTypes) ? sourceTypes[0] : undefined;
    const isAi = typeof singleType === 'string' && AI_NODE_TYPES.test(singleType);

    if (isAi) {
      sendProgress?.('正在保存并展示...');
      const aiSingleResult = await materializeContentForOutput(upstreamValue, {
        prefix: 'io',
        scope: apiConfig.scope,
      });
      return finalize({
        result: aiSingleResult.content ?? upstreamValue,
        savedFiles: aiSingleResult.savedFiles,
        savedPaths: aiSingleResult.savedPaths,
      });
    }

    // Non-AI upstream: pass through without saving
    sendProgress?.('正在展示...');
    return finalize({ result: upstreamValue });
  }

  // No upstream: serve own content (prefer _rawContent for execution, fallback to content)
  const selfContent = nodeData._rawContent ?? nodeData.content;
  if (selfContent !== undefined && selfContent !== null) {
    return finalize({ result: selfContent });
  }

  return finalize({ result: null });
}
