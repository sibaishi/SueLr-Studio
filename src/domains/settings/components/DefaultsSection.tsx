import type { ThemeMode } from '@/lib/types';
import { IOSLabel, IOSSegmentedControl } from '@/components/ios';
import { SectionCard, eyebrowStyle, mutedPanelStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function DefaultsSection({ actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="主题与界面偏好" description="切换当前工作室的色彩模式。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div>
            <IOSLabel>色彩模式</IOSLabel>
            <div style={{ maxWidth: 360 }}>
              <IOSSegmentedControl options={view.themeOptions} value={view.themeMode} onChange={(value) => actions.setThemeMode(value as ThemeMode)} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="能力映射" description="这里总结各能力域当前实际可用的模型数量，方便快速核验系统可生产性。">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Chat</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{view.projectModels.filter((model) => model.type === 'chat' && model.enabled).length}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>对话模型</div>
          </div>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Image</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{view.projectModels.filter((model) => model.type === 'image' && model.enabled).length}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>图像模型</div>
          </div>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>Video</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>{view.projectModels.filter((model) => model.type === 'video' && model.enabled).length}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>视频模型</div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
