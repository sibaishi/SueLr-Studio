export async function execute(node, inputs, apiConfig, onProgress) {
  void apiConfig;
  onProgress('拆分文本...');

  const sourceText = String(inputs.text ?? '');
  const rawSeparator = node?.data?.separator;
  const separator = typeof rawSeparator === 'string' && rawSeparator.length > 0 ? rawSeparator : '\n';
  const requestedOutputCount = Number(node?.data?.outputCount ?? 2);
  const outputCount = Math.max(1, Math.min(9, Number.isFinite(requestedOutputCount) ? Math.trunc(requestedOutputCount) : 2));

  const segments = sourceText
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const buildOutputValue = (index) => (
    index < outputCount - 1
      ? segments[index]
      : segments.slice(index).join(separator)
  );

  const result = {};
  for (let index = 0; index < outputCount; index += 1) {
    result[`part${index + 1}`] = buildOutputValue(index);
  }

  return result;
}
