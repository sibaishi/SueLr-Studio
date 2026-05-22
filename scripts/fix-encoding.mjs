import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve('.');
const EXCLUDED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', 'release']);
const TEXT_EXTENSIONS = new Set([
  '.bat', '.cjs', '.css', '.d.ts', '.html', '.js', '.json',
  '.md', '.mjs', '.sh', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const SELF_RELATIVE_PATH = 'scripts/fix-encoding.mjs';

function shouldSkipPath(absolutePath) {
  const relativePath = relative(ROOT, absolutePath);
  if (!relativePath || relativePath.startsWith('..')) return false;
  return relativePath.split(/[\\/]+/).some((seg) => EXCLUDED_SEGMENTS.has(seg));
}

function isTrackedTextFile(absolutePath) {
  const ext = extname(absolutePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return absolutePath.endsWith('.test.js') || absolutePath.endsWith('.test.ts') || absolutePath.endsWith('.spec.ts');
}

function walk(dirPath, files = []) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const abs = join(dirPath, entry.name);
    if (shouldSkipPath(abs)) continue;
    if (entry.isDirectory()) { walk(abs, files); continue; }
    if (entry.isFile() && isTrackedTextFile(abs)) files.push(abs);
  }
  return files;
}

function detectUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

// Common encoding corruptions for Chinese text:
// GBK bytes read as UTF-8  → replacement chars
// UTF-8 bytes read as Latin-1 → mojibake pairs
function tryFixBuffer(buf) {
  // Attempt 1: strip UTF-8 BOM
  if (detectUtf8Bom(buf)) {
    return { fixed: buf.subarray(3), method: 'bom-removed' };
  }

  // Attempt 2: buffer is already valid UTF-8
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { fixed: buf, method: 'already-valid' };
  } catch { /* fall through */ }

  // Attempt 3: decode as GBK, re-encode as UTF-8
  try {
    const gbkText = new TextDecoder('gbk').decode(buf);
    const utf8Buf = new TextEncoder().encode(gbkText);
    // Verify round-trip
    const verify = new TextDecoder('utf-8', { fatal: true }).decode(utf8Buf);
    return { fixed: utf8Buf, method: 'gbk-to-utf8' };
  } catch { /* fall through */ }

  // Attempt 4: decode as Latin-1 (ISO-8859-1), re-encode as UTF-8
  try {
    const latin1Text = new TextDecoder('latin1').decode(buf);
    const utf8Buf = new TextEncoder().encode(latin1Text);
    const verify = new TextDecoder('utf-8', { fatal: true }).decode(utf8Buf);
    return { fixed: utf8Buf, method: 'latin1-to-utf8' };
  } catch { /* fall through */ }

  return null;
}

let fixedCount = 0;
let alreadyValidCount = 0;
let unfixableCount = 0;

for (const filePath of walk(ROOT)) {
  const buf = readFileSync(filePath);
  const rel = relative(ROOT, filePath);
  const normRel = rel.split('\\').join('/');

  if (normRel === SELF_RELATIVE_PATH) continue;

  const result = tryFixBuffer(buf);
  if (!result) {
    console.error(`✗ UNFIXABLE: ${rel}`);
    unfixableCount++;
    continue;
  }

  if (result.method === 'already-valid') {
    alreadyValidCount++;
    continue;
  }

  writeFileSync(filePath, result.fixed);
  console.log(`✓ FIXED (${result.method}): ${rel}`);
  fixedCount++;
}

console.log(`\n---`);
console.log(`Valid (unchanged): ${alreadyValidCount}`);
console.log(`Fixed:             ${fixedCount}`);
console.log(`Unfixable:         ${unfixableCount}`);

if (unfixableCount > 0) process.exit(1);
