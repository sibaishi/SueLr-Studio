function trimSeparatorAdjacentNewlines(text) {
  return String(text)
    .replace(/^[ \t]*(?:\r?\n)+/, '')
    .replace(/(?:\r?\n)+[ \t]*$/, '');
}

function splitTextPreservingRemainder(sourceText, separator, outputCount) {
  const parts = [];
  let cursor = 0;

  for (let index = 0; index < outputCount - 1; index += 1) {
    const separatorIndex = sourceText.indexOf(separator, cursor);
    if (separatorIndex === -1) break;
    parts.push(trimSeparatorAdjacentNewlines(sourceText.slice(cursor, separatorIndex)));
    cursor = separatorIndex + separator.length;
  }

  parts.push(sourceText.slice(cursor));
  return parts;
}

export async function execute(node, inputs, apiConfig, onProgress) {
  void apiConfig;
  onProgress('拆分文本...');

  const sourceText = String(inputs.text ?? '');
  const rawSeparator = node?.data?.separator;
  const separator = typeof rawSeparator === 'string' && rawSeparator.length > 0 ? rawSeparator : '\n';
  const requestedOutputCount = Number(node?.data?.outputCount ?? 2);
  const outputCount = Math.max(1, Math.min(9, Number.isFinite(requestedOutputCount) ? Math.trunc(requestedOutputCount) : 2));

  const segments = splitTextPreservingRemainder(sourceText, separator, outputCount);

  const result = {};
  for (let index = 0; index < outputCount; index += 1) {
    result[`part${index + 1}`] = segments[index] ?? '';
  }

  return result;
}
