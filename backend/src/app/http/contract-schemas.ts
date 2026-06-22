import { z } from 'zod';
import type { DynamicValue, PlainObject } from '../../modules/types.ts';

export function isPlainObject(value: DynamicValue): value is PlainObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createSafeIdSchema(fieldName: string, maxLength: number, pattern: RegExp) {
  return z
    .string()
    .trim()
    .min(1, `${fieldName} 不能为空`)
    .max(maxLength, `${fieldName} 长度超限`)
    .regex(pattern, `${fieldName} 包含非法字符`);
}

export function createPlainObjectSchema(message: string) {
  return z.custom<PlainObject>(isPlainObject, { message });
}
