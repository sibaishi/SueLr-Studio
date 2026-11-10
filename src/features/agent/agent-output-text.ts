export function looksLikeJsonText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function readEmbeddedJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function normalizeEscapedText(value: string) {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

function splitLines(value: string) {
  return normalizeEscapedText(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isChangesHeading(line: string) {
  const normalized = line
    .trim()
    .replace(/^[-*+>\s]+/, '')
    .replace(/^\*\*|\*\*$|^__|__$/g, '')
    .trim();
  return /^(#{1,6}\s*)?(changes?|优化项|优化说明|修改说明|调整说明)[:：]?$/i.test(normalized);
}

function isOptimizedHeading(line: string) {
  const normalized = line
    .trim()
    .replace(/^[-*+>\s]+/, '')
    .replace(/^\*\*|\*\*$|^__|__$/g, '')
    .trim();
  return /^(#{1,6}\s*)?(optimized|优化后(?:的)?提示词|优化结果|最终提示词)[:：]?$/i.test(normalized);
}

function stripListMarker(line: string) {
  return line
    .replace(/^[-*+>]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^\*\*|\*\*$|^__|__$/g, '')
    .trim();
}

function readLooseObjectSections(value: string) {
  const normalized = normalizeEscapedText(value).trim();
  if (!normalized) return null;

  const optimizedMatch = normalized.match(
    /(?:^|[\n\r\s{,])(?:\*\*|__)?(?:"?optimized"?|"?优化后(?:的)?提示词"?|"?优化结果"?)(?:\*\*|__)?\s*[:：]\s*([\s\S]*?)(?=(?:[\n\r\s,}]+(?:\*\*|__)?(?:"?changes?"?|"?优化项"?|"?优化说明"?|"?修改说明"?)(?:\*\*|__)?\s*[:：])|$)/i,
  );
  const changesBlockMatch = normalized.match(
    /(?:^|[\n\r\s{,])(?:\*\*|__)?(?:"?changes?"?|"?优化项"?|"?优化说明"?|"?修改说明"?)(?:\*\*|__)?\s*[:：]\s*([\s\S]*)$/i,
  );

  const optimizedPrompt = optimizedMatch?.[1]
    ? optimizedMatch[1]
        .trim()
        .replace(/^['"`]|['"`,]$/g, '')
        .trim()
    : undefined;

  const changesBlock = changesBlockMatch?.[1]?.trim();
  const changes = changesBlock
    ? changesBlock
        .split(/\n|(?:^|\s)[-*+>]\s+|(?:^|\s)\d+[.)]\s+/)
        .map((item) =>
          item
            .trim()
            .replace(/^['"`]|['"`,]$/g, '')
            .replace(/^\*\*|\*\*$|^__|__$/g, '')
            .trim(),
        )
        .filter(Boolean)
    : undefined;

  if (!optimizedPrompt && !changes?.length) return null;
  return {
    optimizedPrompt,
    changes: changes?.length ? changes : undefined,
  };
}

export function extractPromptOptimizeSections(value: string) {
  const normalized = normalizeEscapedText(value).trim();
  if (!normalized) return { optimizedPrompt: undefined, changes: undefined };

  const embedded = readEmbeddedJsonObject(normalized);
  if (embedded) {
    return {
      optimizedPrompt:
        typeof embedded.optimized === 'string' ? normalizeEscapedText(String(embedded.optimized)).trim() : undefined,
      changes: Array.isArray(embedded.changes)
        ? embedded.changes.map((item) => normalizeEscapedText(String(item)).trim()).filter(Boolean)
        : undefined,
    };
  }

  const looseObjectSections = readLooseObjectSections(normalized);
  if (looseObjectSections) return looseObjectSections;

  const lines = splitLines(normalized);
  if (!lines.length) return { optimizedPrompt: undefined, changes: undefined };

  let mode: 'optimized' | 'changes' = 'optimized';
  const optimizedLines: string[] = [];
  const changes: string[] = [];

  for (const line of lines) {
    if (isOptimizedHeading(line)) {
      mode = 'optimized';
      continue;
    }
    if (isChangesHeading(line)) {
      mode = 'changes';
      continue;
    }

    if (mode === 'changes') {
      const item = stripListMarker(line);
      if (item) changes.push(item);
      continue;
    }

    optimizedLines.push(line);
  }

  const optimizedPrompt = optimizedLines.join('\n').trim() || normalized;
  return {
    optimizedPrompt,
    changes: changes.length ? changes : undefined,
  };
}

export function looksLikeMarkdown(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /(^#{1,6}\s)|(^\s*[-*+]\s)|(^\s*\d+\.\s)|```|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`/m.test(trimmed);
}

export function formatJsonText(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
