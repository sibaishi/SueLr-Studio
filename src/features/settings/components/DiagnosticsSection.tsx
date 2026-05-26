import { LogPanel } from '@/shared/ui/ios';
import { formatRuntimeModeLabel } from '../runtimePresentation';
import type { SettingsActions, SettingsViewModel } from './shared';
import { SectionCard, eyebrowStyle, mutedPanelStyle } from './styles';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function DiagnosticsSection({ actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard
        title="诊断"
        description="查看模型覆盖情况、当前运行模式和最近运行反馈，方便快速定位 Agent 配置问题。"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Chat</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {view.projectModels.filter((model) => model.type === 'chat' && model.enabled).length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>已启用的对话模型</div>
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Image</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {view.projectModels.filter((model) => model.type === 'image' && model.enabled).length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>已启用的图片模型</div>
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Video</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {view.projectModels.filter((model) => model.type === 'video' && model.enabled).length}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>已启用的视频模型</div>
          </div>
        </div>

        <div
          data-testid="settings-runtime-diagnostics"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}
        >
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>运行模式</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {formatRuntimeModeLabel(view.runtimeCapabilities?.mode)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
              原始标识：{view.runtimeCapabilities?.mode || 'unknown'}
            </div>
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>运行时能力</div>
            <div
              className="flex-col"
              style={{ gap: 6, marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}
            >
              <div data-testid="settings-capability-select-directory">
                目录选择器：{view.canSelectDirectory ? '可用' : '禁用'}
              </div>
              <div data-testid="settings-capability-restart-backend">
                后端重启：{view.canRestartBackend ? '可用' : '禁用'}
              </div>
              <div data-testid="settings-capability-embedded-shell">
                内置 Shell：{view.runtimeCapabilities?.hasEmbeddedShell ? '可用' : '禁用'}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="运行日志" description="集中查看最近的连接、导入、搜索和后端运行反馈。">
        <LogPanel
          logs={view.logs}
          onClear={actions.onClearLogs}
          style={{ height: 360, border: '1px solid var(--color-border)', borderRadius: 18, overflow: 'hidden' }}
        />
      </SectionCard>
    </div>
  );
}
