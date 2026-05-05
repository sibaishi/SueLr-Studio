import type { ThemeMode } from '@/lib/types';
import { IOSButton, IOSInput, IOSLabel, IOSSegmentedControl } from '@/shared/ui/ios';
import { SectionCard, eyebrowStyle, mutedPanelStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function DefaultsSection({ actions, view }: Props) {
  const storageSourceLabel = {
    env: '环境变量覆盖',
    custom: '用户自定义',
    legacy: '旧版部署路径',
    default: '系统默认',
  }[view.storageSettings?.source || 'default'];

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="主题与界面偏好" description="切换当前工作室的色彩模式。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div>
            <IOSLabel>色彩模式</IOSLabel>
            <div style={{ maxWidth: 360 }}>
              <IOSSegmentedControl
                options={view.themeOptions}
                value={view.themeMode}
                onChange={(value) => actions.setThemeMode(value as ThemeMode)}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="外部数据路径"
        description="配置工作流、日志、上传文件等数据的存放位置。保存后需要重启后端生效。"
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>当前生效路径</div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--color-text-primary)',
                marginTop: 8,
                overflowWrap: 'anywhere',
              }}
            >
              {view.storageSettingsLoading
                ? '正在读取...'
                : (view.storageSettings?.effectiveRoot || '未获取到路径信息')}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              来源：{storageSourceLabel}
            </div>
            {view.storageSettings?.envOverride ? (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                当前存在 `APP_CONFIG_DIR` 环境变量覆盖，界面保存后不会立刻接管，需先移除该环境变量。
              </div>
            ) : null}
          </div>

          <div>
            <IOSLabel>自定义绝对路径</IOSLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
              <IOSInput
                value={view.storagePathDraft}
                onChange={actions.setStoragePathDraft}
                placeholder="例如：D:\\SueLr-Studio-Data"
              />
              <IOSButton
                label={view.storagePathPicking ? '选择中...' : '选择文件夹'}
                onClick={() => { void actions.pickStoragePath(); }}
                disabled={view.storagePathPicking || view.storageSettingsSaving || view.storageSettingsLoading}
                small
                style={{ width: 'auto', whiteSpace: 'nowrap' }}
              />
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              留空时可点击“恢复默认”。默认路径：{view.storageSettings?.defaultRoot || '未获取'}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <IOSButton
                label={view.storageSettingsSaving ? '保存中...' : '保存路径'}
                onClick={() => { void actions.saveStoragePath(); }}
                disabled={view.storageSettingsSaving || !view.storagePathDraft.trim()}
                small
                style={{ width: 'auto' }}
              />
              <IOSButton
                label={view.storageSettingsSaving ? '处理中...' : '恢复默认'}
                onClick={() => { void actions.resetStoragePath(); }}
                disabled={view.storageSettingsSaving}
                small
                style={{
                  width: 'auto',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </div>
            <IOSButton
              label={view.backendRestarting ? '重启中...' : '重启后端'}
              onClick={() => { void actions.restartBackend(); }}
              disabled={view.backendRestarting}
              small
              style={{
                width: 'auto',
                whiteSpace: 'nowrap',
                background: '#D92D20',
                color: '#fff',
                border: '1px solid rgba(217, 45, 32, 0.55)',
                boxShadow: '0 10px 22px rgba(217, 45, 32, 0.18)',
              }}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="能力映射"
        description="这里总结各能力域当前实际可用的模型数量，方便快速核验系统可生产性。"
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
    </div>
  );
}
