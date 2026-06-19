import { IOSButton, IOSInput, IOSLabel, IOSSegmentedControl, IOSSelect } from '@/shared/ui/ios';
import { Settings } from 'lucide-react';
import type { SettingsActions, SettingsViewModel } from './shared';
import { EmptyStateCard, SectionCard, chipStyle, mutedPanelStyle } from './styles';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function ConnectionSettingsSection({ T, actions, view }: Props) {
  const hasApiKey = Boolean(view.apiKey || view.activeConfig?.apiKeySet);

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="配置身份" description="切换当前工作室使用的 API 配置，并管理配置生命周期。禁用的配置不会参与模型发现与工作流执行。">
        <div className="flex-col" style={{ gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {view.apiConfigs.map((config) => {
              const isEnabled = config.enabled !== false;
              const isActive = config.id === view.activeConfigId;
              return (
                <div
                  key={config.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px 4px 10px',
                    borderRadius: 20,
                    background: isActive ? `${T.purple}16` : `${T.purple}08`,
                    border: isActive ? `1px solid ${T.purple}30` : `1px solid ${T.purple}18`,
                    opacity: isEnabled ? 1 : 0.6,
                    transition: 'opacity 0.2s, background 0.2s',
                  }}
                >
                  <button
                    onClick={() => actions.applyConfig(config.id)}
                    style={{
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? T.purple : 'var(--color-text-primary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {config.name || '未命名配置'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.toggleConfigEnabled(config.id);
                    }}
                    title={isEnabled ? '禁用此配置' : '启用此配置'}
                    style={{
                      width: 32,
                      height: 18,
                      borderRadius: 9,
                      border: 'none',
                      cursor: 'pointer',
                      background: isEnabled ? T.purple : 'var(--color-bg-tertiary)',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 2,
                        left: isEnabled ? 16 : 2,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ minWidth: 0 }} data-testid="settings-config-name-field">
              <IOSLabel>配置名称</IOSLabel>
              <IOSInput value={view.activeConfig?.name || ''} onChange={actions.setActiveConfigName} />
            </div>
            <div style={{ minWidth: 0 }}>
              <IOSLabel>认证状态</IOSLabel>
              <div
                title={hasApiKey ? '已设置 API Key，可以开始连接测试' : '还没有提供 API Key'}
                style={{
                  ...mutedPanelStyle(),
                  minHeight: 44,
                  padding: '10px 12px',
                  color: 'var(--color-text-secondary)',
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {hasApiKey ? '已设置 API Key，可以开始连接测试' : '还没有提供 API Key'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <IOSButton
              small
              label="测试连接"
              onClick={() => void actions.testConnection()}
              data-testid="settings-test-connection"
            />
            <ConnectionTestStatus status={view.connectionStatus} result={view.connectionResult} />
            <IOSButton small label="添加配置" onClick={actions.addConfig} color={T.green} />
            {view.apiConfigs.length > 1 && (
              <IOSButton
                small
                label="删除当前"
                color={T.red}
                onClick={() => actions.deleteConfig(view.activeConfigId)}
              />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="连接参数" description="基础地址和密钥是大多数模型能力的入口。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div data-testid="settings-base-url-field">
            <IOSLabel>接口地址</IOSLabel>
            <IOSInput value={view.base} onChange={actions.setConnectionBase} placeholder="https://..." />
          </div>
          <div data-testid="settings-api-key-field">
            <IOSLabel>API 密钥</IOSLabel>
            <IOSInput
              value={view.apiKey}
              onChange={actions.setConnectionApiKey}
              type="password"
              placeholder={view.activeConfig?.apiKeySet ? '已保存，留空则继续使用' : 'sk-...'}
            />
          </div>
          {(!view.base || !hasApiKey) && (
            <EmptyStateCard
              title="连接信息还不完整"
              body="测试连接前需要先补齐接口地址和 API 密钥。"
              action={
                view.base
                  ? '当前还缺少 API 密钥，填写后即可校验模型发现能力。'
                  : '先填写可访问的接口地址，再补充 API 密钥并执行连接测试。'
              }
            />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Provider 适配"
        description="对接非标准 OpenAI 兼容接口时，在这里微调请求协议。"
        action={<Settings size={14} color={T.text3} />}
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <IOSLabel>认证方式</IOSLabel>
              <IOSSelect
                value={view.providerConfig.authType}
                onChange={(value) => actions.setProviderAuthType(value as typeof view.providerConfig.authType)}
                data-testid="settings-provider-auth-type"
              >
                <option value="bearer">Bearer Token</option>
                <option value="api-key">API Key Header</option>
                <option value="custom">自定义 Header</option>
              </IOSSelect>
            </div>
            <div>
              <IOSLabel>模型列表接口</IOSLabel>
              <IOSInput
                value={view.providerConfig.modelsEndpoint ?? ''}
                onChange={actions.setProviderModelsEndpoint}
                data-testid="settings-provider-models-endpoint"
              />
            </div>
          </div>
          {view.providerConfig.authType === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div>
                <IOSLabel>Header 名称</IOSLabel>
                <IOSInput
                  value={view.providerConfig.customHeaderName ?? ''}
                  onChange={actions.setProviderCustomHeaderName}
                />
              </div>
              <div>
                <IOSLabel>Header 前缀</IOSLabel>
                <IOSInput value={view.providerConfig.customPrefix ?? ''} onChange={actions.setProviderCustomPrefix} />
              </div>
            </div>
          )}
          <div>
            <IOSLabel>图像请求超时（毫秒）</IOSLabel>
            <IOSInput value={String(view.providerConfig.imageTimeoutMs)} onChange={actions.setProviderImageTimeoutMs} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="联网搜索" description="全局搜索能力的开关与 API Key。配置后 Agent 自动获得联网检索能力。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ maxWidth: 360 }}>
            <IOSLabel>联网搜索</IOSLabel>
            <IOSSegmentedControl
              options={[
                { l: '关闭', v: 'off' },
                { l: '开启', v: 'on' },
              ]}
              value={view.networkSearch.searchEnabled ? 'on' : 'off'}
              onChange={(value) => actions.setNetworkSearchEnabled(value === 'on')}
            />
          </div>
          {view.networkSearch.searchEnabled && (
            <div style={{ maxWidth: 400 }}>
              <IOSLabel>Tavily API Key</IOSLabel>
              <IOSInput
                value={view.networkSearch.tavilyApiKey}
                onChange={actions.setNetworkSearchTavilyApiKey}
                type="password"
                placeholder={view.networkSearch.tavilyApiKey ? '已配置，留空沿用' : 'tvly-...'}
              />
            </div>
          )}
          <span style={chipStyle(view.networkSearch.searchEnabled && view.networkSearch.tavilyApiKey ? 'var(--color-green)' : view.networkSearch.searchEnabled ? '#f59e0b' : undefined)}>
            {view.networkSearch.searchEnabled && view.networkSearch.tavilyApiKey
              ? '已配置并启用'
              : view.networkSearch.searchEnabled
                ? '已启用，等待 API Key'
                : '联网搜索已关闭'}
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

function ConnectionTestStatus({ status, result }: { status: 'idle' | 'testing' | 'success' | 'error'; result: string }) {
  if (status === 'idle') return null;

  if (status === 'testing') {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span className="cn-spinner" style={{ width: 12, height: 12, border: '2px solid var(--color-border-primary)', borderTopColor: 'var(--color-text-secondary)', borderRadius: '50%', display: 'inline-block' }} />
        检测中…
      </span>
    );
  }

  if (status === 'success') {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-green)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
        ✓ {result}
      </span>
    );
  }

  return (
    <span style={{ fontSize: 12, color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
      ✗ {result}
    </span>
  );
}
