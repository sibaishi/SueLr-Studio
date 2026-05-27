import type { DynamicValue, NodeInputs, ProgressCallback, RuntimeApiConfig, WorkflowNode } from './types.js';
function getBoolean(value: DynamicValue, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function removeDelimitedRanges(
  sourceText: string,
  {
    startToken,
    endToken,
    removeStartToken,
    removeEndToken,
    removeAllRanges,
  }: {
    startToken: string;
    endToken: string;
    removeStartToken: boolean;
    removeEndToken: boolean;
    removeAllRanges: boolean;
  },
) {
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

function trimBoundaryBlankLines(text: string) {
  return String(text)
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '');
}

export async function execute(
  node: WorkflowNode,
  inputs: NodeInputs,
  apiConfig: RuntimeApiConfig,
  onProgress: ProgressCallback,
) {
  void apiConfig;
  onProgress?.('清理文本...');

  const data = node?.data || {};
  const text = String(inputs.text ?? '');
  const startToken = String(data.startToken ?? '<think>');
  const endToken = String(data.endToken ?? '</think>');

  const cleanedText = removeDelimitedRanges(text, {
    startToken,
    endToken,
    removeStartToken: getBoolean(data.removeStartToken, true),
    removeEndToken: getBoolean(data.removeEndToken, true),
    removeAllRanges: getBoolean(data.removeAllRanges, true),
  });

  return {
    text: trimBoundaryBlankLines(cleanedText),
  };
}
