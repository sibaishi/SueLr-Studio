import { readFileSync, writeFileSync } from 'node:fs';

const files = ['package.json', 'package-lock.json', 'backend/package.json', 'backend/package-lock.json'];
const entries = files.map((file) => ({
  file,
  url: new URL(`../${file}`, import.meta.url),
  data: JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')),
}));
const version = entries[0].data.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`产品版本格式错误：${version}`);

const mode = process.argv[2];
if (!['--check', '--bump'].includes(mode)) throw new Error('请使用 --check 或 --bump');
if (mode === '--bump') {
  const [major, minor, patch] = version.split('.').map(Number);
  const next = `${major}.${minor}.${patch + 1}`;
  for (const { url, data } of entries) {
    data.version = next;
    if (data.packages) data.packages[''].version = next;
    writeFileSync(url, `${JSON.stringify(data, null, 2)}\n`);
  }
  console.log(`产品版本已同步：${version} → ${next}`);
} else {
  for (const { file, data } of entries) {
    if (data.version !== version || (data.packages && data.packages['']?.version !== version)) {
      throw new Error(`${file} 产品版本不一致，应为 ${version}`);
    }
  }
  console.log(`产品版本一致：${version}`);
}
