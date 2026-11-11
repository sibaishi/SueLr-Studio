import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../../app/errors/index.ts';
import { getScopedStoragePaths, writeJsonFile } from '../../platform/storage/index.ts';
import { getStoredFileType } from './files.repository.ts';
import type { ScopeOptions } from './types.ts';
import { uploadMetadataRepository } from './upload-metadata.repository.ts';

export const assetMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().max(60).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    favorite: z.boolean().optional(),
  })
  .strict();

export const assetQuerySchema = z
  .object({
    search: z.string().trim().max(200).default(''),
    type: z.enum(['all', 'image', 'video', 'audio', 'text', 'data', 'file']).default('all'),
    source: z.enum(['all', 'uploaded', 'generated']).default('all'),
    category: z.string().trim().max(60).default(''),
    favorite: z.enum(['all', 'true']).default('all'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();

type Metadata = z.infer<typeof assetMetadataSchema>;
type Query = z.infer<typeof assetQuerySchema>;
export type LibraryAsset = {
  id: string;
  name: string;
  originalName: string;
  source: 'uploaded' | 'generated';
  type: string;
  mimeType: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  modifiedAt: number;
  category: string;
  tags: string[];
  favorite: boolean;
};

function metadataFile(options: ScopeOptions) {
  return path.join(getScopedStoragePaths(options.scope).filesDir, 'asset-library.json');
}

function readMetadata(options: ScopeOptions): Record<string, Metadata> {
  const file = metadataFile(options);
  if (!fs.existsSync(file)) return {};
  try {
    return z.record(z.string(), assetMetadataSchema).parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    throw new ValidationError('ASSET_METADATA_INVALID', '资产整理信息无法读取，请检查数据目录中的 asset-library.json');
  }
}

function inventory(options: ScopeOptions): LibraryAsset[] {
  const storage = getScopedStoragePaths(options.scope);
  const uploads = uploadMetadataRepository.listRecords();
  const metadata = readMetadata(options);
  const items: LibraryAsset[] = [];
  for (const source of ['uploaded', 'generated'] as const) {
    const root = source === 'uploaded' ? storage.uploadsDir : storage.generatedDir;
    const visit = (directory: string) => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (source === 'generated') visit(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;
        // A file may disappear while an upload or output cleanup is completing.
        let stat: fs.Stats;
        try {
          stat = fs.statSync(absolutePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
        const id = createHash('sha256').update(`${source}:${relativePath}`).digest('hex');
        const info = { ...getStoredFileType(entry.name) };
        const record = source === 'uploaded' ? uploads[entry.name] : undefined;
        const originalName = record?.fileName || entry.name;
        if (record?.mimeType) {
          const mediaType = record.mimeType.split('/')[0];
          if (['image', 'video', 'audio'].includes(mediaType)) info.type = mediaType;
        }
        const saved = metadata[id];
        const prefix = source === 'uploaded' ? '/api/files/' : '/api/outputs/';
        const url = prefix + relativePath.split('/').map(encodeURIComponent).join('/');
        const parsed = path.posix.parse(relativePath);
        const thumb = `${parsed.dir ? `${parsed.dir}/` : ''}.thumbnails/${parsed.name}__thumb.jpg`;
        items.push({
          id,
          name: saved?.name || originalName,
          originalName,
          source,
          type: info.type,
          mimeType: record?.mimeType || info.mimeType,
          url,
          thumbnailUrl: info.type === 'image' ? prefix + thumb.split('/').map(encodeURIComponent).join('/') : '',
          size: stat.size,
          modifiedAt: stat.mtimeMs,
          category: saved?.category || '',
          tags: saved?.tags || [],
          favorite: saved?.favorite || false,
        });
      }
    };
    visit(root);
  }
  return items.sort((a, b) => b.modifiedAt - a.modifiedAt || a.id.localeCompare(b.id));
}

export function listAssets(query: Query, options: ScopeOptions = {}) {
  const assets = inventory(options);
  const search = query.search.toLocaleLowerCase();
  const filtered = assets.filter(
    (asset) =>
      (query.type === 'all' || asset.type === query.type) &&
      (query.source === 'all' || asset.source === query.source) &&
      (!query.category || asset.category === query.category) &&
      (query.favorite !== 'true' || asset.favorite) &&
      (!search ||
        [asset.name, asset.originalName, asset.category, ...asset.tags].join(' ').toLocaleLowerCase().includes(search)),
  );
  const pageSize = 48;
  const total = filtered.length;
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / pageSize)));
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    categories: [...new Set(assets.map((asset) => asset.category).filter(Boolean))].sort(),
    libraryTotal: assets.length,
  };
}

export function updateAsset(id: string, patch: Metadata, options: ScopeOptions = {}) {
  const asset = inventory(options).find((item) => item.id === id);
  if (!asset) throw new NotFoundError('ASSET_NOT_FOUND', '资产文件不存在，请刷新资产库');
  const metadata = readMetadata(options);
  metadata[id] = { ...metadata[id], ...patch, ...(patch.tags ? { tags: [...new Set(patch.tags)] } : {}) };
  writeJsonFile(metadataFile(options), metadata);
  return { ...asset, ...metadata[id] };
}
