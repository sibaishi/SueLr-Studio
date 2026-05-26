import { ValidationError } from '../errors/index.js';

export function zodValidator(schema) {
  return (input) => {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    throw new ValidationError('VALIDATION_ERROR', issue?.message || '请求参数无效');
  };
}
