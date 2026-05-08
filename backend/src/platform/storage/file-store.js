import fs from 'fs';
import path from 'path';
import { ensureDir } from './ensure-dir.js';
import { safeResolveWithin } from './safe-path.js';

export function writeFileWithin(baseDir, relativePath, content) {
  const filePath = safeResolveWithin(baseDir, relativePath);
  if (!filePath) return null;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function deleteFileWithin(baseDir, relativePath) {
  const filePath = safeResolveWithin(baseDir, relativePath);
  if (!filePath || !fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
