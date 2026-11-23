import { readFileSync } from 'node:fs';

// 后端随应用一起发布，版本由 backend/package.json 提供。
export const APP_VERSION: string = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
).version;
