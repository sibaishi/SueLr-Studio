import { strFromU8, strToU8, unzipSync } from 'fflate';
import { workflowApiFetch } from './api/base';
import { getUploadedFilenameFromUrl, uploadFile } from './api/files';
import { archiveLimit, downloadArchive, readArchiveAsset, safeArchiveName } from './fileArchive';
import { parseWorkflowImport } from './importExport';
import type { PersistedWorkflow } from './persistenceTypes';

const mediaExtensions = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|m4v|mp3|m4a|ogg|wav)$/i;
function isLocalAsset(value: string) {
  if (!/^\/api\/(files|outputs|runtime\/workflows)\/[^?#\\]+$/.test(value)) return false;
  try {
    return value.split('/').slice(3).every((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded && decoded !== '.' && decoded !== '..' && !/[\\/]/.test(decoded);
    });
  } catch {
    return false;
  }
}

function mapStrings(value: unknown, map: (value: string) => string): unknown {
  if (typeof value === 'string') return map(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, map));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, map)]));
}

export function getWorkflowAssetReferences(workflow: unknown) {
  const references = new Set<string>();
  mapStrings(workflow, (value) => {
    if (isLocalAsset(value)) references.add(value);
    return value;
  });
  return [...references];
}

export async function exportWorkflowArchive(workflow: PersistedWorkflow, name: string, references: string[]) {
  const entries: Record<string, Uint8Array> = Object.create(null);
  const assets: { url: string; entry: string; fileName: string; type: string }[] = [];
  let remaining = archiveLimit;
  for (const url of references) {
    const fileName = safeArchiveName(decodeURIComponent(url.split('/').at(-1) || ''));
    if (!mediaExtensions.test(fileName) || url.startsWith('/api/runtime/')) {
      throw new Error(`素材「${fileName}」无法随包迁移，请先将它保存为本地媒体素材。`);
    }
    const blob = await readArchiveAsset(url, remaining);
    remaining -= blob.size;
    const entry = `assets/${assets.length + 1}-${fileName}`;
    entries[entry] = new Uint8Array(await blob.arrayBuffer());
    assets.push({ url, entry, fileName, type: blob.type });
  }
  entries['workflow.json'] = strToU8(JSON.stringify(workflow));
  entries['assets.json'] = strToU8(JSON.stringify(assets));
  if (entries['workflow.json'].length + entries['assets.json'].length > remaining) {
    throw new Error('工作流包超过 100 MB。');
  }
  downloadArchive(entries, `${name}.zip`);
}

export async function readWorkflowArchive(file: File) {
  if (file.size > archiveLimit + 1024 * 1024) throw new Error('工作流包超过 100 MB。');
  let unpacked = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      unpacked += entry.originalSize;
      if (unpacked > archiveLimit) throw new Error('工作流包解压后超过 100 MB。');
      return entry.name === 'workflow.json' || entry.name === 'assets.json' || entry.name.startsWith('assets/');
    },
  });
  if (!entries['workflow.json'] || !entries['assets.json']) throw new Error('工作流包缺少清单。');
  const workflow = parseWorkflowImport(strFromU8(entries['workflow.json']));
  const manifest: unknown = JSON.parse(strFromU8(entries['assets.json']));
  const references = new Set(getWorkflowAssetReferences(workflow));
  if (!Array.isArray(manifest) || manifest.length !== references.size) throw new Error('工作流素材清单不完整。');
  const assets = manifest.map((asset) => {
    if (
      !asset || typeof asset.url !== 'string' || !references.delete(asset.url) ||
      typeof asset.entry !== 'string' || !/^assets\/[^/]+$/.test(asset.entry) ||
      typeof asset.fileName !== 'string' || safeArchiveName(asset.fileName) !== asset.fileName ||
      !mediaExtensions.test(asset.fileName) || typeof asset.type !== 'string' ||
      !/^(image|video|audio)\//.test(asset.type) || !Object.prototype.hasOwnProperty.call(entries, asset.entry)
    ) throw new Error('工作流包包含无效或重复的素材。');
    return { url: String(asset.url), file: new File([new Uint8Array(entries[asset.entry])], asset.fileName, { type: asset.type }) };
  });

  const replacements = new Map<string, string>();
  const rollback = () => Promise.allSettled([...replacements.values()].map((url) =>
    workflowApiFetch(`/files/${encodeURIComponent(getUploadedFilenameFromUrl(url))}`, { method: 'DELETE' }),
  ));
  try {
    for (const asset of assets) {
      const result = await uploadFile(asset.file);
      if (!result.success || !result.url) throw new Error(`${asset.file.name}：${result.error || '恢复素材失败'}`);
      replacements.set(asset.url, result.url);
    }
    return { workflow: mapStrings(workflow, (value) => replacements.get(value) ?? value), rollback };
  } catch (error) {
    await rollback();
    throw error;
  }
}
