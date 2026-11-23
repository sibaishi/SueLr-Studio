import { assetGroupLabel, compareAssets } from '@/shared/workflow/asset-order';
import type { LibraryAsset } from '../lib/api/assets';
import type { AssetLibrarySource } from './AssetLibraryModal';
import { galleryImage } from './WorkflowGalleryNode';

const sampleText = '为演示图像保留清晰轮廓与柔和背景。';

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function createGalleryAssetSource(): AssetLibrarySource {
  let assets: LibraryAsset[] = [
    {
      id: 'gallery-image',
      name: '示例参考图',
      originalName: '示例参考图.svg',
      source: 'generated',
      type: 'image',
      mimeType: 'image/svg+xml',
      url: galleryImage,
      thumbnailUrl: galleryImage,
      size: new Blob([galleryImage]).size,
      modifiedAt: 1795334400000,
      category: '参考素材',
      generation: {
        version: 1,
        runId: 'gallery-run',
        workflowId: 'gallery',
        nodeId: 'model',
        createdAt: 1795334400000,
        prompt: '保留参考图主体的轮廓与细节，使用明亮、清晰的画面。',
        references: [{ url: galleryImage, kind: 'image' }],
        parameters: { model: '演示图像模型', mode: 'image', ratio: '4:3', n: 1 },
      },
      tags: ['图像'],
      favorite: true,
    },
    {
      id: 'gallery-text',
      name: '示例提示词',
      originalName: '示例提示词.txt',
      source: 'uploaded',
      type: 'text',
      mimeType: 'text/plain',
      url: `data:text/plain;charset=utf-8,${encodeURIComponent(sampleText)}`,
      thumbnailUrl: '',
      size: new Blob([sampleText]).size,
      modifiedAt: 1795334400000,
      category: '文案',
      tags: ['提示词'],
      favorite: false,
    },
  ];

  return {
    async list(query) {
      const search = (query.get('search') || '').trim().toLowerCase();
      const type = query.get('type');
      const source = query.get('source');
      const category = query.get('category');
      const items = assets.filter(
        (item) =>
          (!search || [item.name, item.category, ...item.tags].some((part) => part.toLowerCase().includes(search))) &&
          (type === 'all' || item.type === type) &&
          (source === 'all' || item.source === source) &&
          (!category || item.category === category) &&
          (query.get('favorite') !== 'true' || item.favorite),
      );
      const group = query.get('group') || 'none';
      items.sort((a, b) => compareAssets(a, b, query.get('sort') || 'newest', group));
      const page = Math.min(Number(query.get('page')) || 1, Math.max(1, Math.ceil(items.length / 48)));
      const pageSize = 48;
      return {
        success: true,
        data: {
          items: items
            .slice((page - 1) * pageSize, page * pageSize)
            .map((asset) => ({ ...asset, groupLabel: assetGroupLabel(asset, group) })),
          total: items.length,
          page,
          pageSize,
          categories: [...new Set(assets.map((item) => item.category).filter(Boolean))],
          libraryTotal: assets.length,
        },
      };
    },
    async upload(file) {
      const kind = file.type.split('/')[0];
      if (file.size > 2 * 1024 * 1024 || !['image', 'text', 'audio', 'video'].includes(kind)) {
        return { success: false, error: '演示支持 2 MB 以内的图片、文本、音频和视频。' };
      }
      try {
        const url = await readDataUrl(file);
        assets.unshift({
          id: crypto.randomUUID(),
          name: file.name,
          originalName: file.name,
          source: 'uploaded',
          type: kind as 'image' | 'text' | 'audio' | 'video',
          mimeType: file.type,
          url,
          thumbnailUrl: kind === 'image' ? url : '',
          size: file.size,
          modifiedAt: Date.now(),
          category: '',
          tags: [],
          favorite: false,
        });
        return { success: true };
      } catch {
        return { success: false, error: '无法读取演示素材。' };
      }
    },
    async update(id, patch) {
      const item = assets.find((asset) => asset.id === id);
      if (!item) return { success: false, error: '演示资产不存在。' };
      const data = { ...item, ...patch };
      assets = assets.map((asset) => (asset.id === id ? data : asset));
      return { success: true, data };
    },
    async remove(id) {
      assets = assets.filter((asset) => asset.id !== id);
      return { success: true };
    },
    async batch(ids, change) {
      const selected = new Set(ids);
      const count = assets.filter((asset) => selected.has(asset.id)).length;
      assets =
        change.action === 'remove'
          ? assets.filter((asset) => !selected.has(asset.id))
          : assets.map((asset) => (selected.has(asset.id) ? { ...asset, ...change.patch } : asset));
      return { success: true, data: { count } };
    },
  };
}
