import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from './ensure-dir.js';
import { safeResolveWithin } from './safe-path.js';

export function writeFileWithin(baseDir: string, relativePath: string, content: string): string | null {
  const filePath = safeResolveWithin(baseDir, relativePath);
  if (!filePath) return null;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function deleteFileWithin(baseDir: string, relativePath: string): boolean {
  const filePath = safeResolveWithin(baseDir, relativePath);
  if (!filePath || !fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
