import { ValidationError } from '../../app/errors/index.ts';
import type { DynamicValue, PlainObject } from '../types.ts';

function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function ensureObjectBody(value: DynamicValue, message: string) {
  if (!isPlainObject(value)) {
    throw new ValidationError('VALIDATION_ERROR', message);
  }
  return value;
}
