import { Search } from 'lucide-react';
import { IOSButton, IOSInput, IOSLabel, LogPanel } from '@/components/ios';
import { EmptyStateCard, SectionCard, chipStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function DiagnosticsSection({ T, actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="网页搜索" description="校验 Tavily 能力是否可用，并把结果沉淀到运行日志。" action={<Search size={14} color={T.text3} />}>
        <div className="flex-col" style={{ gap: 12 }}>
          <div>
            <IOSLabel>Tavily API Key</IOSLabel>
            <IOSInput value={view.tavilyApiKey} onChange={actions.setTavilyApiKey} type="password" placeholder="tvly-..." />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <IOSButton small label="测试搜索" onClick={() => void actions.testSearch()} disabled={!view.tavilyApiKey} />
            <span style={chipStyle((view.tavilyApiKey || view.tavilyApiKeySet) ? T.green : T.orange)}>{(view.tavilyApiKey || view.tavilyApiKeySet) ? '已配置搜索能力' : '未配置搜索能力'}</span>
          </div>
          {!view.tavilyApiKey && (
            <EmptyStateCard
              title="搜索能力还未启用"
              body="当前还没有可用的 Tavily API Key，因此无法执行联网搜索测试。"
              action="填写密钥后可立即执行一次搜索测试，并在下方日志中查看返回结果。"
            />
          )}
        </div>
      </SectionCard>

      <SectionCard title="实时日志" description="查看最近的系统反馈，快速定位连接、导入和能力测试结果。">
        <LogPanel logs={view.logs} onClear={actions.onClearLogs} style={{ height: 360, border: '1px solid var(--color-border)', borderRadius: 18, overflow: 'hidden' }} />
      </SectionCard>
    </div>
  );
}
