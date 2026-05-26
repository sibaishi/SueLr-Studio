import { useState } from 'react';
import type { CSSProperties } from 'react';
import { LongTextEditorModal } from './LongTextEditorModal';
import { NodeParamFields } from './NodeParamFields';
import type { NodeDef } from './nodeContentTypes';

function getBoolean(value: unknown, fallback: boolean) {
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

function buildTextCleanPreview(data: Record<string, unknown>, outputs?: Record<string, unknown>) {
  if (typeof outputs?.text === 'string') return outputs.text;
  const text = String(data.previewText ?? data.text ?? '');
  return trimBoundaryBlankLines(
    removeDelimitedRanges(text, {
      startToken: String(data.startToken ?? '<think>'),
      endToken: String(data.endToken ?? '</think>'),
      removeStartToken: getBoolean(data.removeStartToken, true),
      removeEndToken: getBoolean(data.removeEndToken, true),
      removeAllRanges: getBoolean(data.removeAllRanges, true),
    }),
  );
}

function trimSeparatorAdjacentNewlines(text: string) {
  return String(text)
    .replace(/^[ \t]*(?:\r?\n)+/, '')
    .replace(/(?:\r?\n)+[ \t]*$/, '');
}

function trimSeparatorLeadingNewlines(text: string) {
  return String(text).replace(/^[ \t]*(?:\r?\n)+/, '');
}

function getTextSplitOutputCount(data: Record<string, unknown>) {
  const requestedOutputCount = Number(data.outputCount ?? 2);
  return Math.max(1, Math.min(9, Number.isFinite(requestedOutputCount) ? Math.trunc(requestedOutputCount) : 2));
}

function splitTextIntoSegments(sourceText: string, separator: string, outputCount: number) {
  const parts: string[] = [];
  let cursor = 0;

  for (let index = 0; index < outputCount - 1; index += 1) {
    const separatorIndex = sourceText.indexOf(separator, cursor);
    if (separatorIndex === -1) break;
    parts.push(trimSeparatorAdjacentNewlines(sourceText.slice(cursor, separatorIndex)));
    cursor = separatorIndex + separator.length;
  }

  parts.push(trimSeparatorLeadingNewlines(sourceText.slice(cursor)));
  while (parts.length < outputCount) parts.push('');
  return parts.slice(0, outputCount);
}

function getStoredTextSplitSegments(data: Record<string, unknown>) {
  return Array.isArray(data.segments) ? data.segments.map((item) => String(item ?? '')) : null;
}

function normalizeTextSplitSegments(segments: string[], outputCount: number) {
  return Array.from({ length: outputCount }, (_, index) => segments[index] ?? '');
}

function buildTextSplitLocalSegments(data: Record<string, unknown>) {
  const outputCount = getTextSplitOutputCount(data);
  const storedSegments = getStoredTextSplitSegments(data);
  if (storedSegments) {
    return normalizeTextSplitSegments(storedSegments, outputCount);
  }

  const sourceText = String(data.previewText ?? data.text ?? '');
  const rawSeparator = data.separator;
  const separator = typeof rawSeparator === 'string' && rawSeparator.length > 0 ? rawSeparator : '\n';
  return splitTextIntoSegments(sourceText, separator, outputCount);
}

function buildTextSplitPreview(data: Record<string, unknown>, outputs?: Record<string, unknown>) {
  const outputCount = getTextSplitOutputCount(data);
  const outputEntries = Object.entries(outputs || {})
    .filter(([key]) => /^part\d+$/.test(key))
    .sort(([keyA], [keyB]) => Number(keyA.replace('part', '')) - Number(keyB.replace('part', '')))
    .map(([, value]) => String(value ?? ''));

  return outputEntries.length > 0
    ? normalizeTextSplitSegments(outputEntries, outputCount)
    : buildTextSplitLocalSegments(data);
}

export function TextResultPreviewContent({
  params,
  nodeType,
  nodeId,
  data,
  outputs,
  outerStyle,
  onChange,
  onPatch,
  mode,
}: {
  params: NonNullable<NodeDef>['params'];
  nodeType: string;
  nodeId?: string;
  data: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  outerStyle: CSSProperties;
  onChange: (paramId: string, value: unknown) => void;
  onPatch: (patch: Record<string, unknown>) => void;
  mode: 'clean' | 'split';
}) {
  const [fullscreenValue, setFullscreenValue] = useState<{ title: string; value: string; segments?: string[] } | null>(
    null,
  );
  const cleanPreview = mode === 'clean' ? buildTextCleanPreview(data, outputs) : '';
  const splitPreview = mode === 'split' ? buildTextSplitPreview(data, outputs) : [];
  const hasRuntimeOutput = Boolean(outputs && Object.keys(outputs).length > 0);
  return (
    <div
      className="node-content-shell node-settings-content node-settings-content--with-preview"
      style={{ ...outerStyle, overflow: 'auto' }}
    >
      <div className="node-settings-content__inner">
        <NodeParamFields
          params={params}
          nodeType={nodeType}
          nodeId={nodeId}
          values={data}
          onChange={onChange}
          onPatch={onPatch}
        />
        <div className="node-result-preview">
          <div className="node-result-preview__header">
            <span>{mode === 'clean' ? '清理后预览' : '拆分预览'}</span>
            <span>{hasRuntimeOutput ? '最近执行结果' : '本地预览'}</span>
          </div>
          {mode === 'clean' ? (
            <button
              type="button"
              className={['node-result-preview__text', cleanPreview ? '' : 'node-result-preview__text--empty']
                .filter(Boolean)
                .join(' ')}
              onDoubleClick={() => cleanPreview && setFullscreenValue({ title: '查看清理后文本', value: cleanPreview })}
              title={cleanPreview ? '双击全屏查看' : undefined}
            >
              {cleanPreview || '暂无可预览内容，执行后会显示清理结果。'}
            </button>
          ) : (
            <button
              type="button"
              className="node-result-preview__open"
              onClick={() =>
                setFullscreenValue({
                  title: '查看拆分预览',
                  value: splitPreview.some((item) => item.trim()) ? splitPreview.join('\n\n') : '暂无可预览内容。',
                  segments: splitPreview,
                })
              }
            >
              拆分预览
            </button>
          )}
        </div>
      </div>
      {fullscreenValue && (
        <LongTextEditorModal
          title={fullscreenValue.title}
          value={fullscreenValue.value}
          segments={fullscreenValue.segments}
          placeholder=""
          onChange={() => undefined}
          onSegmentsChange={(nextSegments) => {
            setFullscreenValue((current) =>
              current
                ? {
                    ...current,
                    segments: nextSegments,
                    value: nextSegments.join('\n\n'),
                  }
                : current,
            );
            onPatch({ segments: nextSegments });
          }}
          onClose={() => setFullscreenValue(null)}
        />
      )}
    </div>
  );
}
