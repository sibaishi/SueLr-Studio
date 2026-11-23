type BrowsableAsset = {
  id: string;
  name: string;
  type: string;
  source: string;
  category: string;
  modifiedAt: number;
  size: number;
};

export function assetGroupLabel(asset: BrowsableAsset, group: string) {
  if (group === 'type')
    return (
      (
        { image: '图片', video: '视频', audio: '音频', text: '文本', data: '数据', file: '文件' } as Record<
          string,
          string
        >
      )[asset.type] || '文件'
    );
  if (group === 'source') return asset.source === 'uploaded' ? '上传素材' : '生成结果';
  if (group === 'category') return asset.category || '未分类';
  if (group === 'date') {
    const date = new Date(asset.modifiedAt);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return '';
}

export function compareAssets(a: BrowsableAsset, b: BrowsableAsset, sort: string, group: string) {
  const groupOrder =
    assetGroupLabel(a, group).localeCompare(assetGroupLabel(b, group), 'zh-CN') * (group === 'date' ? -1 : 1);
  if (groupOrder) return groupOrder;
  const order =
    sort === 'oldest'
      ? a.modifiedAt - b.modifiedAt
      : sort === 'name'
        ? a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
        : sort === 'size'
          ? b.size - a.size
          : b.modifiedAt - a.modifiedAt;
  return order || a.id.localeCompare(b.id);
}
