import path from 'node:path';

const DATA_URL_PREFIX = /^data:([\w.+-]+\/[\w.+-]+)?(?:;charset=[^;,]+)?;base64,/i;
const INLINE_DATA_URL_MIN_LENGTH = 512;
const INLINE_PREVIEW_LENGTH = 48;

function createInlineDataArtifact({ keyPath, value, mimeType, runLogger }) {
  const artifactPath = runLogger.writeTextFile(`${keyPath || 'payload'}-inline-data`, value, 'dataurl.txt');

  return {
    kind: 'inline-data-url',
    mimeType: mimeType || 'application/octet-stream',
    encoding: 'base64',
    storage: 'text/data-url',
    length: value.length,
    preview: `${value.slice(0, INLINE_PREVIEW_LENGTH)}...`,
    artifact: path.basename(artifactPath),
  };
}

function sanitizeValue(value, context) {
  if (typeof value === 'string') {
    const dataUrlMatch = value.match(DATA_URL_PREFIX);
    if (dataUrlMatch && value.length >= INLINE_DATA_URL_MIN_LENGTH) {
      return createInlineDataArtifact({
        keyPath: context.keyPath,
        value,
        mimeType: dataUrlMatch[1],
        runLogger: context.runLogger,
      });
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeValue(item, {
        ...context,
        keyPath: `${context.keyPath || 'item'}-${index + 1}`,
      }),
    );
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value);
  return Object.fromEntries(
    entries.map(([key, nestedValue]) => [
      key,
      sanitizeValue(nestedValue, {
        ...context,
        keyPath: context.keyPath ? `${context.keyPath}-${key}` : key,
      }),
    ]),
  );
}

export function sanitizeNodeOutputsForLogs(outputs, runLogger) {
  if (!runLogger) return outputs;
  return sanitizeValue(outputs, { runLogger, keyPath: 'node-output' });
}
