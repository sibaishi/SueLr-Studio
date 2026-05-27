// biome-ignore lint/suspicious/noExplicitAny: Module controllers and service dependencies receive dynamic Express/runtime payloads.
export type DynamicValue = any;

export type RequestLike = {
  body?: DynamicValue;
  headers?: Record<string, DynamicValue>;
  on: (event: 'aborted', listener: () => void) => unknown;
  off?: (event: 'aborted', listener: () => void) => unknown;
  scope?: DynamicValue;
  [key: string]: DynamicValue;
};

export type ResponseLike = {
  json(data: DynamicValue): DynamicValue;
  on: (event: 'close' | 'finish', listener: () => void) => unknown;
  off?: (event: 'close', listener: () => void) => unknown;
  write: (...args: DynamicValue[]) => boolean;
  writeHead: (statusCode: number, headers?: Record<string, DynamicValue>) => unknown;
  end: () => unknown;
  writableEnded: boolean;
  destroyed?: boolean;
  [key: string]: DynamicValue;
};

export type NextFunctionLike = (error?: unknown) => void;

export type PlainObject = Record<string, DynamicValue>;
