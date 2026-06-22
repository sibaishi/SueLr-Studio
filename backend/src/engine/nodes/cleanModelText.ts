/**
 * cleanModelText — 清理 AI 模型输出中常见的格式垃圾
 *
 * 清理顺序（从上到下逐层剥）：
 *   1. stripThink      → <think>...</think> <thinking>  等思考标签
 *   2. stripCodeFences  → ```json ``` 等 Markdown 代码块标记
 *   3. stripRolePrefixes → assistant: / 助手：等行首角色标签
 *   4. stripPreamble     → "好的，以下..." 等引导语段落
 *   5. stripTrailing     → "如有疑问..." 等末尾后记
 *   6. 全局 trim 去首尾空白 + 去首尾空白行
 */

// ── think / reasoning 标签 ──────────────────────────────────────

const THINK_PAIRS: [RegExp | string, RegExp | string][] = [
  [/<think\s*>/gi, '</think>'],
  [/<thinking\s*>/gi, '</thinking>'],
  [/<思考\s*>/gi, '</思考>'],
  // DeepSeek R1 / Qwen3 类模型可能输出精简的  形式
  [/<\s*think\s*>/gi, '</s*thinks*>'],
];

function stripThinkPairs(text: string): string {
  let result = text;
  for (const [open, close] of THINK_PAIRS) {
    const openRe = typeof open === 'string' ? new RegExp(open, 'gi') : open;
    const closeRe = typeof close === 'string' ? new RegExp(close, 'gi') : close;
    result = removeAllDelimitedRanges(result, openRe, closeRe);
  }
  return result;
}

/** 移除所有匹配的区间（与 textClean 的 removeDelimitedRanges 同语义，但接受正则）*/
function removeAllDelimitedRanges(text: string, startRe: RegExp, endRe: RegExp): string {
  let output = '';
  let cursor = 0;

  while (cursor < text.length) {
    startRe.lastIndex = cursor;
    const startMatch = startRe.exec(text);
    if (!startMatch) {
      output += text.slice(cursor);
      break;
    }

    const contentStart = startMatch.index + startMatch[0].length;
    endRe.lastIndex = contentStart;
    const endMatch = endRe.exec(text);
    if (!endMatch) {
      output += text.slice(cursor);
      break;
    }

    // 保留区间前的文本，丢弃区间内 + 标记本身
    output += text.slice(cursor, startMatch.index);
    cursor = endMatch.index + endMatch[0].length;
  }

  return output;
}

// ── Markdown 代码块标记 ─────────────────────────────────────────

const CODE_FENCE_RE = /^\s*```[a-zA-Z_-]*\s*$/;

function stripCodeFences(text: string): string {
  return text
    .split('\n')
    .filter((line) => !CODE_FENCE_RE.test(line))
    .join('\n');
}

// ── 行首角色前缀 ────────────────────────────────────────────────

const ROLE_PREFIX_RE = /^\s*(?:assistant|ai|agent|bot|助手|助理|输出|结果)\s*[:：]\s*/i;

function stripRolePrefixes(text: string): string {
  const lines = text.split('\n');
  if (lines.length === 0) return text;
  const firstNonBlank = lines.findIndex((l) => l.trim() !== '');
  if (firstNonBlank === -1) return text;
  lines[firstNonBlank] = lines[firstNonBlank].replace(ROLE_PREFIX_RE, '');
  return lines.join('\n');
}

// ── 引导语段落（preamble）───────────────────────────────────────

const PREAMBLE_PATTERNS = [
  /^(?:好的|好[的的]|OK[,，]?\s*)?(?:以下|如下|这是|Here\s+is|Here's)(?:是|为|根据)?\s*(?:你[的的]?|您[的的]?|为)?\s*(?:请求|需求|问题|查询|结果|输出|生成|回答|回复|数据|JSON|文本|内容)/im,
  /^(?:Sure|Certainly|Of course)[,，]?\s*(?:here\s+is|below\s+is)/im,
  /^(?:根据|按照|基于)(?:你[的的]?|您[的的]?|上述)\s*(?:要求|需求|请求|指令|提示|查询|描述)/im,
  /^(?:I['']ll|I\s+will|Let\s+me)\s+(?:generate|create|provide|help|assist)/im,
  /^(?:让我|我来|我会|我将)\s*(?:为[你您]|帮[你您])?\s*(?:生成|创建|提供|输出|编写)/im,
];

/**
 * 如果第一段是明显的引导语（短段落 + 匹配关键词），整体移除。
 * 只移除第一段，不影响正文。
 */
function stripPreamble(text: string): string {
  // 取第一个非空段落
  const paragraphs = text.split(/\n\s*\n/);
  if (paragraphs.length <= 1) return text;

  const firstParagraph = paragraphs[0].trim();
  // 引导语通常较短（< 200 字符）
  if (firstParagraph.length > 200) return text;

  for (const pattern of PREAMBLE_PATTERNS) {
    if (pattern.test(firstParagraph)) {
      return paragraphs.slice(1).join('\n\n');
    }
  }

  return text;
}

// ── 末尾后记 ───────────────────────────────────────────────────

const TRAILING_PATTERNS = [
  /^(?:希望|祝[你您]|如果[你您]|如有|若有|若有?任何|欢迎|以上)(?:这些|以上|所述|内容|信息|回答|结果|答案)?\s*(?:对[你您]|有所?|能够|可以|有)?\s*(?:帮助|用|参考|价值|启发|用处|需要|疑问|问题|意见|反馈|建议|不清楚|不明白)?/im,
  /^(?:请|可以|随时|如果|若有|欢迎)(?:继续|再次)?\s*(?:联系|提问|追问|咨询|告诉|提出)/im,
  /^(?:请注意|注意)[：:]/im,
  /^(?:If\s+you|Please|Feel\s+free)\s+(?:have|need|want|would\s+like)/im,
  /^(?:Hope|I\s+hope)\s+(?:this|these|it)\s+(?:helps|is\s+helpful|works)/im,
];

function stripTrailing(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  if (paragraphs.length <= 1) return text;

  const lastIdx = paragraphs.length - 1;
  const lastParagraph = paragraphs[lastIdx]?.trim() || '';

  // 末尾段通常比较短 + 不含实质性内容
  if (lastParagraph.length > 300) return text;

  for (const pattern of TRAILING_PATTERNS) {
    if (pattern.test(lastParagraph)) {
      return paragraphs.slice(0, lastIdx).join('\n\n');
    }
  }

  return text;
}

// ── 主入口 ─────────────────────────────────────────────────────

export interface CleanConfig {
  stripThink?: boolean;
  stripCodeFences?: boolean;
  stripRolePrefixes?: boolean;
  stripPreamble?: boolean;
  stripTrailing?: boolean;
}

const DEFAULT_CONFIG: CleanConfig = {
  stripThink: true,
  stripCodeFences: true,
  stripRolePrefixes: true,
  stripPreamble: true,
  stripTrailing: true,
};

export function cleanModelText(text: string, config?: CleanConfig): string {
  if (!text) return '';

  const cfg = { ...DEFAULT_CONFIG, ...config };
  let result = text;

  // 1. 思考标签
  if (cfg.stripThink) {
    result = stripThinkPairs(result);
  }

  // 2. 代码块标记
  if (cfg.stripCodeFences) {
    result = stripCodeFences(result);
  }

  // 3. 行首角色前缀
  if (cfg.stripRolePrefixes) {
    result = stripRolePrefixes(result);
  }

  // 4. 引导语段落
  if (cfg.stripPreamble) {
    result = stripPreamble(result);
  }

  // 5. 末尾后记
  if (cfg.stripTrailing) {
    result = stripTrailing(result);
  }

  // 6. 全局去首尾空白行
  result = trimBoundaryBlankLines(result.trim());

  return result;
}

// ── 辅助 ───────────────────────────────────────────────────────

function trimBoundaryBlankLines(text: string): string {
  return String(text)
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '');
}
