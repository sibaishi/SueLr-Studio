import { ValidationError } from '../../app/errors/index.js';

function ensureObject(payload, message) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
  return payload;
}

function cleanString(value, maxLength = 5000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLength);
}

function validateId(value, fieldName) {
  const id = cleanString(value, 120);
  if (!id) throw new ValidationError('VALIDATION_ERROR', `${fieldName} cannot be empty`);
  return id;
}

function validateArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new ValidationError('VALIDATION_ERROR', `${fieldName} must be an array`);
  }
  return value;
}

export function validateAgentChatBody(payload) {
  const body = ensureObject(payload, 'request body must be an object');
  const options = ensureObject(body.options ?? {}, 'options must be an object');
  return {
    sessionId: cleanString(body.sessionId, 120),
    conversationId: cleanString(body.conversationId, 120),
    profileId: cleanString(body.profileId, 120),
    model: cleanString(body.model, 200),
    messages: validateArray(body.messages ?? [], 'messages'),
    attachments: validateArray(body.attachments ?? [], 'attachments'),
    options: {
      stream: options.stream === true,
      allowWebSearch: options.allowWebSearch !== false,
    },
    apiConfig: ensureObject(body.apiConfig ?? {}, 'apiConfig must be an object'),
  };
}

export function validateAgentMemoryImportBody(payload) {
  const body = ensureObject(payload, 'request body must be an object');
  return {
    memories: validateArray(body.memories ?? body, 'memories').map((item, index) => {
      const record = ensureObject(item, `memories[${index}] must be an object`);
      return {
        id: cleanString(record.id, 120) || undefined,
        scope: ['global', 'conversation', 'workflow'].includes(record.scope) ? record.scope : 'global',
        source: ['chat', 'workflow', 'manual'].includes(record.source) ? record.source : 'manual',
        content: cleanString(record.content, 12000),
        tags: Array.isArray(record.tags) ? record.tags.map((tag) => cleanString(tag, 80)).filter(Boolean) : [],
        importance: Number.isFinite(Number(record.importance)) ? Number(record.importance) : 1,
        createdAt: Number(record.createdAt) || Date.now(),
        updatedAt: Number(record.updatedAt) || Date.now(),
        conversationId: cleanString(record.conversationId, 120) || undefined,
        workflowId: cleanString(record.workflowId, 120) || undefined,
      };
    }),
  };
}

export function validateAgentSessionId(value) {
  return validateId(value, 'sessionId');
}

export function validateAgentRecordId(value) {
  return validateId(value, 'id');
}
