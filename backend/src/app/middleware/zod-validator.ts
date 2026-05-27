import { ValidationError } from '../errors/index.js';

interface ZodIssueLike {
  message?: string;
}

interface ZodErrorLike {
  issues: ZodIssueLike[];
}

type SafeParseResult<TOutput> =
  | {
      success: true;
      data: TOutput;
    }
  | {
      success: false;
      error: ZodErrorLike;
    };

interface SafeParseSchema<TInput, TOutput> {
  safeParse(input: TInput): SafeParseResult<TOutput>;
}

export function zodValidator<TInput, TOutput>(schema: SafeParseSchema<TInput, TOutput>) {
  return (input: TInput): TOutput => {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    throw new ValidationError('VALIDATION_ERROR', issue?.message || '请求参数无效');
  };
}
