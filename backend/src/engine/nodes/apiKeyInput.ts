import { resolveNodeEndpoint } from '../helpers/apiConfig.ts';
import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.ts';

export async function execute(node: WorkflowNode) {
  const apiKey = String(node.data?.apiKey || '').trim();
  const baseUrl = String(node.data?.baseUrl || '').trim();
  const model = String(node.data?.selectedModel || '').trim();
  const endpointMode = node.data?.endpointMode === 'custom' ? 'custom' : 'category';
  const endpointCategory = String(node.data?.endpointCategory || 'chat').trim();
  const customEndpoint = String(node.data?.customEndpoint || '').trim();
  const legacyEndpoint = String(node.data?.endpoint || '').trim();
  const endpoint = resolveNodeEndpoint({
    modelId: model,
    endpointMode,
    endpointCategory,
    customEndpoint,
    legacyEndpoint,
  });

  if (!apiKey) {
    throw new Error('API Key 节点缺少必填项：API Key');
  }
  if (!baseUrl) {
    throw new Error('API Key 节点缺少必填项：Base URL');
  }
  if (!model) {
    throw new Error('API Key 节点缺少必填项：模型');
  }
  if (!endpoint) {
    throw new Error(
      endpointMode === 'custom' ? 'API Key 节点缺少必填项：自定义接口路径' : 'API Key 节点缺少必填项：接口类型',
    );
  }

  return {
    apiKey: {
      apiKey,
      baseUrl,
      model,
      endpointMode,
      endpointCategory,
      customEndpoint,
      endpoint,
      providerConfig: {
        modelOverrides: {
          [model]: {
            endpoint,
          },
        },
      },
    },
  };
}
