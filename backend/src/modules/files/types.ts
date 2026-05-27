import type { DynamicValue, PlainObject } from '../types.js';

export type ScopeOptions = {
  scope?: DynamicValue;
};

export type UploadedFileLike = {
  filename: string;
  mimetype: string;
  originalname: string;
  path: string;
  size: number;
};

export type UploadRecord = PlainObject & {
  filename?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  kind?: string;
  mimeType?: string;
  processingError?: string;
  processingStatus?: string;
  thumbnailUrl?: string;
  url?: string;
  width?: number;
  height?: number;
};

export type UploadMetadataStore = {
  items: Record<string, UploadRecord>;
};
