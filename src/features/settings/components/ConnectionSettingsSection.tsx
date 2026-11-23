import { Button, TextInput, FieldLabel, Select, ToggleSwitch } from '@/ui/FormPrimitives';
import { Gear } from '@phosphor-icons/react';
import { ConnectionTestStatus } from './ConnectionTestStatus';
import type { SettingsActions, SettingsViewModel } from './shared';
import { EmptyStateCard, SectionCard } from '@/ui/PanelPrimitives';
import { mutedPanelStyle } from './styles';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function ConnectionSettingsSection({ T, actions, view }: Props) {
  const hasApiKey = Boolean(view.apiKey || view.activeConfig?.apiKeySet);

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard
        title="配置身份"
        description="切换当前工作室使用的 API 配置，并管理配置生命周期。禁用的配置不会参与模型发现与工作流执行。"
      >
        <div className="flex-col" style={{ gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {view.apiConfigs.map((config) => {
              const isEnabled = config.enabled !== false;
              const isActive = config.id === view.activeConfigId;
              return (
                <div
                  key={config.id}
                  className="settings-config-choice"
                >
                  <Button small variant="secondary" aria-pressed={isActive} onClick={() => actions.applyConfig(config.id)}>
                    {config.name || '未命名配置'}
                  </Button>
                  <ToggleSwitch
                    aria-label={`启用 ${config.name || '未命名配置'}`}
                    title={isEnabled ? '禁用此配置' : '启用此配置'}
                    checked={isEnabled}
                    onChange={() => actions.toggleConfigEnabled(config.id)}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ minWidth: 0 }} data-testid="settings-config-name-field">
              <FieldLabel>配置名称</FieldLabel>
              <TextInput value={view.activeConfig?.name || ''} onChange={actions.setActiveConfigName} />
            </div>
            <div style={{ minWidth: 0 }}>
              <FieldLabel>认证状态</FieldLabel>
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
            <Button
              small
              label="测试连接"
              onClick={() => void actions.testConnection()}
              data-testid="settings-test-connection"
            />
            <ConnectionTestStatus status={view.connectionStatus} result={view.connectionResult} />
            <Button small label="添加配置" onClick={actions.addConfig} accent={T.green} />
            {view.apiConfigs.length > 1 && (
              <Button
                small
                label="删除当前"
                accent={T.red}
                onClick={() => actions.deleteConfig(view.activeConfigId)}
              />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="连接参数" description="基础地址和密钥是大多数模型能力的入口。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div data-testid="settings-base-url-field">
            <FieldLabel>接口地址</FieldLabel>
            <TextInput value={view.base} onChange={actions.setConnectionBase} placeholder="https://..." />
          </div>
          <div data-testid="settings-api-key-field">
            <FieldLabel>API 密钥</FieldLabel>
            <TextInput
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
        action={<Gear size={14} color={T.text3} />}
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <FieldLabel>认证方式</FieldLabel>
              <Select
                value={view.providerConfig.authType}
                onChange={(value) => actions.setProviderAuthType(value as typeof view.providerConfig.authType)}
                data-testid="settings-provider-auth-type"
              >
                <option value="bearer">Bearer Token</option>
                <option value="api-key">API Key Header</option>
                <option value="custom">自定义 Header</option>
              </Select>
            </div>
            <div>
              <FieldLabel>模型列表接口</FieldLabel>
              <TextInput
                value={view.providerConfig.modelsEndpoint ?? ''}
                onChange={actions.setProviderModelsEndpoint}
                data-testid="settings-provider-models-endpoint"
              />
            </div>
          </div>
          {view.providerConfig.authType === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div>
                <FieldLabel>Header 名称</FieldLabel>
                <TextInput
                  value={view.providerConfig.customHeaderName ?? ''}
                  onChange={actions.setProviderCustomHeaderName}
                />
              </div>
              <div>
                <FieldLabel>Header 前缀</FieldLabel>
                <TextInput value={view.providerConfig.customPrefix ?? ''} onChange={actions.setProviderCustomPrefix} />
              </div>
            </div>
          )}
          <div>
            <FieldLabel>图像请求超时（毫秒）</FieldLabel>
            <TextInput value={String(view.providerConfig.imageTimeoutMs)} onChange={actions.setProviderImageTimeoutMs} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
