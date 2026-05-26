import type { OutboundProxyMode } from '@/features/settings';
import type { ThemeMode } from '@/shared/types';
import { IOSButton, IOSInput, IOSLabel, IOSSegmentedControl } from '@/shared/ui/ios';
import { formatRuntimeModeLabel, getRuntimeActionHint } from '../runtimePresentation';
import type { SettingsActions, SettingsViewModel } from './shared';
import { SectionCard, eyebrowStyle, mutedPanelStyle } from './styles';

type Props = {
  actions: SettingsActions;
  view: SettingsViewModel;
};

const proxyModeOptions = [
  { l: '跟随系统', v: 'system' },
  { l: '直连', v: 'direct' },
  { l: '自定义', v: 'custom' },
];

const concurrencyModeOptions = [
  { l: '关闭', v: 'off' },
  { l: '开启', v: 'on' },
];

export function DefaultsSection({ actions, view }: Props) {
  const isServerRuntime = view.runtimeCapabilities?.mode?.startsWith('server') ?? false;
  const storageSourceLabel = {
    env: '环境变量覆盖',
    custom: isServerRuntime ? '浏览器下载偏好' : '用户自定义',
    legacy: '旧版迁移路径',
    default: isServerRuntime ? '浏览器默认下载行为' : '系统默认',
  }[view.storageSettings?.source || 'default'];

  const updateProxy = (patch: Partial<typeof view.outboundProxy>) => {
    actions.setOutboundProxy({ ...view.outboundProxy, ...patch });
  };

  const selectDirectoryHint = getRuntimeActionHint(view.runtimeCapabilities, 'canSelectDirectory');
  const canManageStoragePath = isServerRuntime
    ? true
    : (view.storageSettings?.canManagePath ?? view.canSelectDirectory);

  const effectiveRootLabel = isServerRuntime
    ? view.clientDownloadDirectory?.label || '未设置浏览器自动下载目录，将回退到手动下载'
    : view.storageSettings?.pathsRedacted
      ? '服务器托管存储目录（路径已隐藏）'
      : view.storageSettings?.effectiveRoot || '未获取到路径信息';

  const defaultRootLabel = isServerRuntime
    ? view.clientDownloadDirectory?.supported
      ? '浏览器默认下载位置'
      : '当前浏览器不支持自动下载目录授权'
    : view.storageSettings?.pathsRedacted
      ? '服务器托管存储目录（路径已隐藏）'
      : view.storageSettings?.defaultRoot || '未获取';

  const pathTitle = isServerRuntime ? '浏览器自动下载目录' : '自定义绝对路径';
  const pathPlaceholder = isServerRuntime
    ? '选择后，server-web 输出会优先自动保存到该目录'
    : view.storageSettings?.pathsRedacted
      ? '服务器模式下不开放路径编辑'
      : '例如：D:\\SueLr-Studio-Data';
  const pathDescription = isServerRuntime
    ? '该设置只影响当前浏览器用户接收 server-web 输出时的本地自动下载位置，不会修改服务器宿主机存储路径。'
    : `留空时可点击“恢复默认”。默认路径：${defaultRootLabel}`;

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="主题与界面偏好" description="切换当前工作室的颜色主题。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div>
            <IOSLabel>颜色主题</IOSLabel>
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
        title="工作流执行"
        description="控制工作流节点、逐项执行和多图生成是否并发，以及同一时间最多启动多少个任务。"
      >
        <div className="flex-col" style={{ gap: 14 }}>
          <div>
            <IOSLabel>并发执行</IOSLabel>
            <div style={{ maxWidth: 260 }}>
              <IOSSegmentedControl
                options={concurrencyModeOptions}
                value={view.workflowConcurrency.enabled ? 'on' : 'off'}
                onChange={(value) =>
                  actions.setWorkflowConcurrency({
                    ...view.workflowConcurrency,
                    enabled: value === 'on',
                  })
                }
              />
            </div>
          </div>

          <div style={{ maxWidth: 260 }}>
            <IOSLabel>最大并发数</IOSLabel>
            <IOSInput
              value={String(view.workflowConcurrency.maxConcurrency)}
              onChange={(value) => {
                const parsed = Number(value);
                actions.setWorkflowConcurrency({
                  ...view.workflowConcurrency,
                  maxConcurrency: Number.isFinite(parsed)
                    ? Math.max(1, Math.round(parsed))
                    : view.workflowConcurrency.maxConcurrency,
                });
              }}
              placeholder="5"
            />
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              关闭并发时按 1 个任务顺序执行；开启后这个数值会同时限制工作流分支、逐项运行和 AI 生图张数请求。
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="外部数据路径"
        description={
          isServerRuntime
            ? '在 server-web 中，这里表示当前浏览器用户接收输出时的本地自动下载目录，不代表服务器宿主机路径。'
            : '配置工作流、日志、上传文件等数据的存放位置。保存后可能需要重启后端生效。'
        }
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div data-testid="settings-runtime-storage-mode" style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>运行模式</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-primary)', marginTop: 8 }}>
              {formatRuntimeModeLabel(view.runtimeCapabilities?.mode)}
            </div>
            {isServerRuntime ? (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                服务器宿主机存储路径不会显示在这里。这里仅管理当前浏览器的自动下载偏好。
              </div>
            ) : !canManageStoragePath ? (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                {selectDirectoryHint}
              </div>
            ) : null}
          </div>

          <div style={{ ...mutedPanelStyle(), padding: 14 }}>
            <div style={eyebrowStyle()}>{isServerRuntime ? '当前下载目录' : '当前生效路径'}</div>
            <div
              data-testid="settings-storage-effective-root"
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--color-text-primary)',
                marginTop: 8,
                overflowWrap: 'anywhere',
              }}
            >
              {view.storageSettingsLoading ? '正在读取...' : effectiveRootLabel}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              来源：{storageSourceLabel}
            </div>
            {!isServerRuntime && view.storageSettings?.envOverride ? (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
                当前存在 `APP_CONFIG_DIR` 环境变量覆盖，界面保存后不会立刻接管，需要先移除该环境变量。
              </div>
            ) : null}
          </div>

          <div>
            <IOSLabel>{pathTitle}</IOSLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
              <IOSInput
                value={view.storagePathDraft}
                onChange={actions.setStoragePathDraft}
                placeholder={pathPlaceholder}
                disabled={isServerRuntime || !canManageStoragePath}
              />
              <IOSButton
                label={view.storagePathPicking ? '选择中...' : isServerRuntime ? '授权目录' : '选择文件夹'}
                onClick={() => {
                  void actions.pickStoragePath();
                }}
                disabled={
                  view.storagePathPicking ||
                  view.storageSettingsSaving ||
                  view.storageSettingsLoading ||
                  (!isServerRuntime && (!view.canSelectDirectory || !canManageStoragePath))
                }
                data-testid="settings-pick-storage-path"
                small
                style={{ width: 'auto', whiteSpace: 'nowrap' }}
              />
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              {pathDescription}
            </div>
            {!isServerRuntime && !canManageStoragePath ? (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                {selectDirectoryHint}
              </div>
            ) : null}
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
                label={view.storageSettingsSaving ? '保存中...' : isServerRuntime ? '应用目录' : '保存路径'}
                onClick={() => {
                  void actions.saveStoragePath();
                }}
                disabled={
                  view.storageSettingsSaving ||
                  (!isServerRuntime && (!view.storagePathDraft.trim() || !canManageStoragePath))
                }
                data-testid="settings-save-storage-path"
                small
                style={{ width: 'auto' }}
              />
              <IOSButton
                label={view.storageSettingsSaving ? '处理中...' : isServerRuntime ? '清除授权' : '恢复默认'}
                onClick={() => {
                  void actions.resetStoragePath();
                }}
                disabled={view.storageSettingsSaving || (!isServerRuntime && !canManageStoragePath)}
                data-testid="settings-reset-storage-path"
                small
                style={{
                  width: 'auto',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </div>
            {view.canRestartBackend ? (
              <IOSButton
                label={view.backendRestarting ? '重启中...' : '重启后端'}
                onClick={() => {
                  void actions.restartBackend();
                }}
                disabled={view.backendRestarting}
                data-testid="settings-restart-backend"
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
            ) : null}
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
              {view.outboundProxy.mode === 'system' &&
                '优先使用 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY 环境变量；Windows 下未设置环境变量时读取系统代理。'}
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
                  支持逗号或分号分隔、通配符、域名后缀和 `&lt;local&gt;`。
                </div>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
