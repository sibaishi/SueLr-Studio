export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string | ApiErrorPayload;
};

export type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  errorDetails?: unknown;
  status?: number;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
