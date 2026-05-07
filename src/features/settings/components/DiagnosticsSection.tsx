import { LogPanel } from '@/shared/ui/ios';
import { SectionCard, eyebrowStyle, mutedPanelStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function DiagnosticsSection({ actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard
        title="能力映射"
        description="汇总各能力域当前实际可用的模型数量，方便快速核验系统可生产性。"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Chat</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {view.projectModels.filter((model) => model.type === 'chat' && model.enabled).length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>对话模型</div>
          </div>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Image</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {view.projectModels.filter((model) => model.type === 'image' && model.enabled).length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>图像模型</div>
          </div>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Video</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {view.projectModels.filter((model) => model.type === 'video' && model.enabled).length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>视频模型</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="实时日志" description="查看最近的系统反馈，快速定位连接、导入和能力测试结果。">
        <LogPanel logs={view.logs} onClear={actions.onClearLogs} style={{ height: 360, border: '1px solid var(--color-border)', borderRadius: 18, overflow: 'hidden' }} />
      </SectionCard>
    </div>
  );
}
