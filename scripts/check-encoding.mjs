import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve('.');
const EXCLUDED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', 'release']);
const TEXT_EXTENSIONS = new Set([
  '.bat',
  '.cjs',
  '.css',
  '.d.ts',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sh',
  '.test.js',
  '.test.ts',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const SUSPICIOUS_TOKENS = ['\uFFFD', 'Ã', 'Â', 'ä¸', 'å', 'æ', 'ç', 'ðŸ'];
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const SELF_RELATIVE_PATH = 'scripts/check-encoding.mjs';

const failures = [];

function shouldSkipPath(absolutePath) {
  const relativePath = relative(ROOT, absolutePath);
  if (!relativePath || relativePath.startsWith('..')) return false;
  return relativePath.split(/[\\/]+/).some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

function isTrackedTextFile(absolutePath) {
  const extension = extname(absolutePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return true;
  return absolutePath.endsWith('.test.js') || absolutePath.endsWith('.test.ts') || absolutePath.endsWith('.spec.ts');
}

function walk(dirPath, files = []) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = join(dirPath, entry.name);
    if (shouldSkipPath(absolutePath)) continue;
    if (entry.isDirectory()) {
      walk(absolutePath, files);
      continue;
    }
    if (entry.isFile() && isTrackedTextFile(absolutePath)) {
      files.push(absolutePath);
    }
  }
  return files;
}

function detectUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function classifyTextFile(absolutePath) {
  const buffer = readFileSync(absolutePath);
  const relativePath = relative(ROOT, absolutePath);
  const normalizedRelativePath = relativePath.split('\\').join('/');

  if (detectUtf8Bom(buffer)) {
    failures.push(`${relativePath}: UTF-8 BOM is not allowed`);
  }

  let text;
  try {
    text = UTF8_DECODER.decode(buffer);
  } catch {
    failures.push(`${relativePath}: file is not valid UTF-8`);
    return;
  }

  if (normalizedRelativePath !== SELF_RELATIVE_PATH) {
    for (const token of SUSPICIOUS_TOKENS) {
      if (text.includes(token)) {
        failures.push(`${relativePath}: contains suspicious mojibake token "${token}"`);
      }
    }
  }
}

for (const filePath of walk(ROOT)) {
  classifyTextFile(filePath);
}

if (failures.length > 0) {
  console.error('Encoding check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Encoding check passed for ${walk(ROOT).length} text files.`);
