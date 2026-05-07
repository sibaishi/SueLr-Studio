import type { OutboundProxyMode } from '@/features/settings';
import type { ThemeMode } from '@/lib/types';
import { IOSButton, IOSInput, IOSLabel, IOSSegmentedControl } from '@/shared/ui/ios';
import { SectionCard, eyebrowStyle, mutedPanelStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  actions: SettingsActions;
  view: SettingsViewModel;
};

const proxyModeOptions = [
  { l: '跟随系统', v: 'system' },
  { l: '直连', v: 'direct' },
  { l: '自定义', v: 'custom' },
];

export function DefaultsSection({ actions, view }: Props) {
  const storageSourceLabel = {
    env: '环境变量覆盖',
    custom: '用户自定义',
    legacy: '旧版部署路径',
    default: '系统默认',
  }[view.storageSettings?.source || 'default'];

  const updateProxy = (patch: Partial<typeof view.outboundProxy>) => {
    actions.setOutboundProxy({ ...view.outboundProxy, ...patch });
  };

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
        title="代理设置"
        description="控制后端访问模型服务和搜索服务时使用的出站代理。改动会随设置自动保存。"
      >
        <div className="flex-col" style={{ gap: 14 }}>
          <div>
            <IOSLabel>代理模式</IOSLabel>
            <IOSSegmentedControl
              options={proxyModeOptions}
              value={view.outboundProxy.mode}
              onChange={(value) => updateProxy({ mode: value as OutboundProxyMode })}
            />
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>当前策略</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              {view.outboundProxy.mode === 'system' && '优先使用 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY 环境变量；Windows 下未设置环境变量时读取系统代理。'}
              {view.outboundProxy.mode === 'direct' && '后端出站请求将直连，不使用环境变量代理或 Windows 系统代理。'}
              {view.outboundProxy.mode === 'custom' && '后端出站请求优先使用下方自定义代理，并按绕过列表直连匹配目标。'}
            </div>
          </div>

          {view.outboundProxy.mode === 'custom' && (
            <div className="flex-col" style={{ gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <div>
                  <IOSLabel>HTTP 代理</IOSLabel>
                  <IOSInput
                    value={view.outboundProxy.httpProxy}
                    onChange={(value) => updateProxy({ httpProxy: value })}
                    placeholder="http://127.0.0.1:7890"
                  />
                </div>
                <div>
                  <IOSLabel>HTTPS 代理</IOSLabel>
                  <IOSInput
                    value={view.outboundProxy.httpsProxy}
                    onChange={(value) => updateProxy({ httpsProxy: value })}
                    placeholder="http://127.0.0.1:7897"
                  />
                </div>
              </div>
              <div>
                <IOSLabel>绕过列表</IOSLabel>
                <IOSInput
                  value={view.outboundProxy.noProxy}
                  onChange={(value) => updateProxy({ noProxy: value })}
                  placeholder="localhost,127.0.0.1,*.internal,<local>"
                />
                <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                  支持逗号或分号分隔、通配符、域名后缀和 &lt;local&gt;。
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
