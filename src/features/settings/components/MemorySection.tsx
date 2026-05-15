import { IOSButton, IOSCard, IOSInput } from '@/shared/ui/ios';
import { EmptyStateCard, SectionCard, chipStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function AgentMemorySection({ T, actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard
        title="Agent Memory"
        description="检索、导出和删除长期记忆条目。记忆只作为对话参考，不会决定或填充 workflow 运行。"
        action={<span style={chipStyle(T.blue)}>{view.filteredMemories.length} 条命中</span>}
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: '10px 12px',
              color: 'var(--color-text-secondary)',
              fontSize: 12,
              lineHeight: 1.6,
              background: 'var(--color-bg-tertiary)',
            }}
          >
            记忆可以帮助 Agent 理解长期偏好，但 workflow 的目标和输入必须来自当前请求与当前工作流状态。
          </div>
          <IOSInput value={view.memoryQuery} onChange={actions.setMemoryQuery} placeholder="搜索记忆内容" />

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <IOSButton small label="导出记忆" onClick={actions.exportMemoriesToFile} />
            <IOSButton small label="全部清空" color={T.red} onClick={actions.onClearMemories} />
          </div>

          <div className="flex-col" style={{ gap: 10 }}>
            {view.filteredMemories.slice(0, 50).map((memory) => (
              <IOSCard
                key={memory.id}
                style={{
                  borderRadius: 18,
                  boxShadow: 'none',
                  background: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="flex-col" style={{ gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    {new Date(memory.ts).toLocaleString()}
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, lineHeight: 1.6 }}>{memory.content}</div>
                  <div>
                    <IOSButton small label="删除" color={T.red} onClick={() => actions.onDeleteMemory(memory.id)} />
                  </div>
                </div>
              </IOSCard>
            ))}

            {view.filteredMemories.length === 0 && (
              <EmptyStateCard
                title="没有命中的记忆条目"
                body="当前筛选条件下没有找到已存储的记忆。"
                action={view.memoryQuery ? '可以更换关键词，或清空筛选后查看全部记忆。' : '当对话被提取并持久化后，记忆会显示在这里。'}
              />
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
