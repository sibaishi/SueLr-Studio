function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

const UNSAFE_MEMORY_PATTERNS = [
  /\b(runId|sessionId|requestId|traceId|localhost|127\.0\.0\.1)\b/i,
  /\b(error|failed|timeout|stack trace|debug|temporary|just now|today|yesterday)\b/i,
  /\b(maybe|probably|possibly|guess|assume|uncertain)\b/i,
  /\b(workflow|workflow_execute|workflow target|workflow input|execute workflow|run workflow|saved workflow|remembered prompt)\b/i,
  /(工作流|执行工作流|运行工作流|下次运行|工作流目标|工作流输入|运行编号|会话编号|请求编号)/i,
  /(刚才|今天|昨天|临时|报错|失败|超时|调试|堆栈|可能|大概|猜测|假设|不确定)/i,
];

export function normalizeMemoryContent(value, maxLength = 5000) {
  return cleanString(value, maxLength).replace(/\s+/g, ' ');
}

export function isMalformedMemoryContent(content) {
  const text = normalizeMemoryContent(content, 12000);
  if (!text) return true;
  if (text === '[object Object]') return true;
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    return true;
  }
  if (/^\s*(undefined|null|nan)\s*$/i.test(text)) return true;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return true;
  return false;
}

export function isUnsafeMemoryWriteContent(content) {
  const text = normalizeMemoryContent(content, 12000);
  if (isMalformedMemoryContent(text)) return true;
  return UNSAFE_MEMORY_PATTERNS.some((pattern) => pattern.test(text));
}

export function normalizeMemoryFingerprint(content) {
  const text = normalizeMemoryContent(content, 12000)
    .toLowerCase()
    .replace(/[，。！？、；：,.!?\s]/g, '');
  if (!text) return '';

  const normalized = text
    .replace(/用户名叫|用户名字叫|用户姓名是|用户名字是|用户名是/g, '')
    .replace(/用户希望默认用中文回复|用户默认用中文回复|默认用中文回复|使用中文回复|用中文回复/g, '中文回复')
    .replace(/userpreferschineseanswers|preferschineseanswers|answerinchinese/g, '中文回复')
    .replace(/用户要求答案尽量分步骤|用户要求回答分步骤|答案尽量分步骤|回答分步骤|分步骤说明|按步骤回答/g, '分步骤')
    .replace(/userprefersstepbystepanswers|stepbystepanswers/g, '分步骤')
    .replace(/用户偏好回答简洁|用户偏好简洁回答|回答简洁|简洁回答|回答尽量简洁/g, '简洁')
    .replace(/userprefersconciseanswers|conciseanswers/g, '简洁')
    .replace(/用户周日单休|周日单休/g, '周日单休')
    .replace(/用户|希望|要求|偏好|默认|尽量|回答|答案|回复|使用|简要|风格|喜欢/g, '')
    .replace(/\b(user|prefers?|wants?|likes?|default|answer|answers?|reply|replies|style)\b/g, '');

  return normalized || text;
}

export function isDuplicateMemory(existingMemories, content, conversationId) {
  const text = normalizeMemoryContent(content, 12000);
  const targetFingerprint = normalizeMemoryFingerprint(text);
  if (!text || !targetFingerprint) return false;
  return (Array.isArray(existingMemories) ? existingMemories : []).some((memory) => {
    const existingContent = normalizeMemoryContent(memory?.content, 12000);
    const sameConversation = !conversationId || !memory?.conversationId || memory.conversationId === conversationId;
    if (!sameConversation || !existingContent) return false;
    return existingContent.includes(text)
      || text.includes(existingContent)
      || normalizeMemoryFingerprint(existingContent) === targetFingerprint;
  });
}

export function normalizeMemoryTags(tags, maxTags = 8) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const normalized = [];
  for (const tag of tags) {
    const clean = cleanString(tag, 80);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    normalized.push(clean);
    if (normalized.length >= maxTags) break;
  }
  return normalized;
}

export function normalizeMemoryImportance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(5, Math.max(1, Math.round(number)));
}
