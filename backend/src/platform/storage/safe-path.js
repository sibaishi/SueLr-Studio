import path from 'node:path';

export function safeResolveWithin(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  const normalizedBase = path.resolve(baseDir);
  return resolved === normalizedBase || resolved.startsWith(`${normalizedBase}${path.sep}`) ? resolved : null;
}
