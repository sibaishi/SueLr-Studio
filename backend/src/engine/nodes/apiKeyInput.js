export async function execute(node) {
  const apiKey = String(node.data?.apiKey || '').trim();
  const baseUrl = String(node.data?.baseUrl || '').trim();
  const model = String(node.data?.selectedModel || '').trim();
  const endpoint = String(node.data?.endpoint || '').trim();

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
    throw new Error('API Key 节点缺少必填项：接口路径');
  }

  return {
    apiKey: {
      apiKey,
      baseUrl,
      model,
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
