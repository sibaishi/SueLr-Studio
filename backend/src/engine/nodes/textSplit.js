function trimSeparatorAdjacentNewlines(text) {
  return String(text)
    .replace(/^[ \t]*(?:\r?\n)+/, '')
    .replace(/(?:\r?\n)+[ \t]*$/, '');
}

function trimSeparatorLeadingNewlines(text) {
  return String(text).replace(/^[ \t]*(?:\r?\n)+/, '');
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

  parts.push(trimSeparatorLeadingNewlines(sourceText.slice(cursor)));
  return parts;
}

function normalizeOutputCount(value) {
  const requestedOutputCount = Number(value ?? 2);
  return Math.max(1, Math.min(9, Number.isFinite(requestedOutputCount) ? Math.trunc(requestedOutputCount) : 2));
}

function normalizeLocalSegments(value, outputCount) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: outputCount }, (_, index) => String(source[index] ?? ''));
}

export async function execute(node, inputs, apiConfig, onProgress) {
  void apiConfig;
  onProgress('拆分文本...');

  const rawSeparator = node?.data?.separator;
  const separator = typeof rawSeparator === 'string' && rawSeparator.length > 0 ? rawSeparator : '\n';
  const outputCount = normalizeOutputCount(node?.data?.outputCount);

  const upstreamText = String(inputs.text ?? '').trim();
  const segments = upstreamText
    ? splitTextPreservingRemainder(String(inputs.text ?? ''), separator, outputCount)
    : normalizeLocalSegments(node?.data?.segments, outputCount);

  const result = {};
  for (let index = 0; index < outputCount; index += 1) {
    result[`part${index + 1}`] = segments[index] ?? '';
  }

  return result;
}
