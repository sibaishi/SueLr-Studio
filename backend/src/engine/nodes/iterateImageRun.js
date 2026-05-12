function getInputIndex(key) {
  const match = String(key || '').match(/^item(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export async function execute(_node, inputs, _apiConfig, sendProgress) {
  const entries = Object.entries(inputs || {})
    .sort(([keyA], [keyB]) => getInputIndex(keyA) - getInputIndex(keyB))
    .flatMap(([, value]) => {
      if (Array.isArray(value)) {
        return value
          .map((item) => String(item ?? '').trim())
          .filter((item) => item.length > 0);
      }
      const image = String(value ?? '').trim();
      return image ? [image] : [];
    });

  const image = entries[0] || '';
  sendProgress?.(image ? '输出当前逐项图像...' : '没有可用的逐项图像...');

  return { image };
}
