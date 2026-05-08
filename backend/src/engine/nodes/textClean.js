function getBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function removeDelimitedRanges(sourceText, {
  startToken,
  endToken,
  removeStartToken,
  removeEndToken,
  removeAllRanges,
}) {
  if (!startToken || !endToken) return sourceText;

  let output = '';
  let cursor = 0;

  while (cursor < sourceText.length) {
    const startIndex = sourceText.indexOf(startToken, cursor);
    if (startIndex === -1) {
      output += sourceText.slice(cursor);
      break;
    }

    const contentStart = startIndex + startToken.length;
    const endIndex = sourceText.indexOf(endToken, contentStart);
    if (endIndex === -1) {
      output += sourceText.slice(cursor);
      break;
    }

    output += sourceText.slice(cursor, startIndex);
    if (!removeStartToken) output += startToken;
    if (!removeEndToken) output += endToken;

    cursor = endIndex + endToken.length;
    if (!removeAllRanges) {
      output += sourceText.slice(cursor);
      break;
    }
  }

  return output;
}

export async function execute(node, inputs, apiConfig, onProgress) {
  void apiConfig;
  onProgress('清理文本...');

  const data = node?.data || {};
  const text = String(inputs.text ?? '');
  const startToken = String(data.startToken ?? '<think>');
  const endToken = String(data.endToken ?? '</think>');

  return {
    text: removeDelimitedRanges(text, {
      startToken,
      endToken,
      removeStartToken: getBoolean(data.removeStartToken, true),
      removeEndToken: getBoolean(data.removeEndToken, true),
      removeAllRanges: getBoolean(data.removeAllRanges, true),
    }),
  };
}
