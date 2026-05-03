import { useT } from '../../contexts/ThemeContext';
import type { ModelInfo } from '../../lib/types';
import { CollapsibleSection } from './CollapsibleSection';

export function ModelCategoryList({ models, searchQuery = '' }: { models: ModelInfo[]; searchQuery?: string }) {
  const T = useT();
  const cats: { key: string; label: string; color: string; icon: string }[] = [
    { key: 'chat', label: '对话模型', color: T.green, icon: 'chat' },
    { key: 'image', label: '图像模型', color: T.orange, icon: 'image' },
    { key: 'video', label: '视频模型', color: T.purple, icon: 'video' },
  ];
  return (
    <div>
      {cats.map(cat => {
        const ms = models.filter(m => m.cat === cat.key && (!searchQuery || m.id.toLowerCase().includes(searchQuery.toLowerCase())));
        if (searchQuery && ms.length === 0) return null;
        return (
          <CollapsibleSection key={cat.key} title={`${cat.label}`} count={ms.length} defaultOpen={false}>
            {ms.map(m => <div key={m.id} style={{ fontSize: 12, color: T.text2, padding: '3px 0' }}>{m.id}</div>)}
            {!searchQuery && ms.length === 0 && <div style={{ fontSize: 12, color: T.text3 }}>当前分类还没有模型</div>}
          </CollapsibleSection>
        );
      })}
      {searchQuery && models.filter(m => m.id.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
        <div style={{ fontSize: 12, color: T.text3, textAlign: 'center', padding: 12, lineHeight: 1.6 }}>
          <div style={{ color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 700 }}>未找到匹配的模型</div>
          <div style={{ marginTop: 6 }}>可以调整搜索关键词，或先测试连接以刷新当前可发现的模型列表。</div>
        </div>
      )}
    </div>
  );
}
