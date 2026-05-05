import { IOSButton, IOSCard, IOSInput } from '@/shared/ui/ios';
import { EmptyStateCard, SectionCard, chipStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function MemorySection({ T, actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="记忆管理" description="检索、导出和清理长期记忆，让聊天侧的上下文资产保持可控。" action={<span style={chipStyle(T.blue)}>{view.filteredMemories.length} 命中</span>}>
        <div className="flex-col" style={{ gap: 12 }}>
          <IOSInput value={view.memoryQuery} onChange={actions.setMemoryQuery} placeholder="搜索记忆" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <IOSButton small label="导出" onClick={actions.exportMemoriesToFile} />
            <IOSButton small label="清空" color={T.red} onClick={actions.onClearMemories} />
          </div>
          <div className="flex-col" style={{ gap: 10 }}>
            {view.filteredMemories.slice(0, 50).map((memory) => (
              <IOSCard key={memory.id} style={{ borderRadius: 18, boxShadow: 'none', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                <div className="flex-center" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.6 }}>{memory.content}</div>
                  <IOSButton small label="删除" color={T.red} onClick={() => actions.onDeleteMemory(memory.id)} />
                </div>
              </IOSCard>
            ))}
            {view.filteredMemories.length === 0 && (
              <EmptyStateCard
                title="没有匹配到记忆"
                body="当前筛选条件下没有找到可用记忆条目。"
                action={view.memoryQuery ? '可以修改关键词重新搜索，或清空筛选后查看全部记忆。' : '记忆会在后续对话使用中逐步积累到这里。'}
              />
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
