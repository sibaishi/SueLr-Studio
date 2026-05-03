export class AppError extends Error {
  constructor(status, code, message, details = undefined, cause = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.cause = cause;
  }
}

export class ValidationError extends AppError {
  constructor(code, message, details = undefined) {
    super(400, code, message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(code, message, details = undefined) {
    super(404, code, message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(code, message, details = undefined) {
    super(409, code, message, details);
    this.name = 'ConflictError';
  }
}

export class ProviderError extends AppError {
  constructor(code, message, details = undefined, cause = undefined) {
    super(502, code, message, details, cause);
    this.name = 'ProviderError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(code, message, details = undefined) {
    super(401, code, message, details);
    this.name = 'UnauthorizedError';
  }
}
