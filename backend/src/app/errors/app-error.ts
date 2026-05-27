export class AppError extends Error {
  status: number;
  code: string;
  details: unknown;
  cause: unknown;

  constructor(status: number, code: string, message: string, details: unknown = undefined, cause: unknown = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.cause = cause;
  }
}

export class ValidationError extends AppError {
  constructor(code: string, message: string, details: unknown = undefined) {
    super(400, code, message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string, details: unknown = undefined) {
    super(404, code, message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details: unknown = undefined) {
    super(409, code, message, details);
    this.name = 'ConflictError';
  }
}

export class ProviderError extends AppError {
  constructor(code: string, message: string, details: unknown = undefined, cause: unknown = undefined) {
    super(502, code, message, details, cause);
    this.name = 'ProviderError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(code: string, message: string, details: unknown = undefined) {
    super(401, code, message, details);
    this.name = 'UnauthorizedError';
  }
}
