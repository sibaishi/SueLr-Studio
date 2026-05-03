import { ValidationError } from '../../app/errors/index.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function ensureObjectBody(value, message) {
  if (!isPlainObject(value)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
  return value;
}
