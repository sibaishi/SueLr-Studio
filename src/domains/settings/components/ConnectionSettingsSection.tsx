import { Settings } from 'lucide-react';
import { IOSButton, IOSInput, IOSLabel, IOSSelect } from '@/components/ios';
import { EmptyStateCard, SectionCard, chipStyle, mutedPanelStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

export function ConnectionSettingsSection({ T, actions, view }: Props) {
  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="配置身份" description="切换当前工作室使用的 API 配置，并管理配置生命周期。">
        <div className="flex-col" style={{ gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {view.apiConfigs.map((config) => (
              <button
                key={config.id}
                onClick={() => actions.applyConfig(config.id)}
                style={{
                  ...chipStyle(config.id === view.activeConfigId ? T.blue : undefined),
                  cursor: 'pointer',
                  background: config.id === view.activeConfigId ? `${T.blue}18` : 'var(--color-bg-secondary)',
                }}
              >
                {config.name || '当前配置还没有名称'}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <IOSLabel>配置名称</IOSLabel>
              <IOSInput value={view.activeConfig?.name || ''} onChange={actions.setActiveConfigName} />
            </div>
            <div style={{ minWidth: 0 }}>
              <IOSLabel>认证状态</IOSLabel>
              <div
                title={view.apiKey ? '已设置 API Key，可以开始连接测试' : '还没有提供 API Key'}
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
                {view.apiKey ? '已设置 API Key，可以开始连接测试' : '还没有提供 API Key'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <IOSButton small label="测试连接" onClick={() => void actions.testConnection()} />
            <IOSButton small label="添加配置" onClick={actions.addConfig} color={T.green} />
            {view.apiConfigs.length > 1 && <IOSButton small label="删除当前" color={T.red} onClick={() => actions.deleteConfig(view.activeConfigId)} />}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="连接参数" description="基础地址和密钥是大多数模型能力的入口。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div>
            <IOSLabel>接口地址</IOSLabel>
            <IOSInput value={view.base} onChange={actions.setConnectionBase} placeholder="https://..." />
          </div>
          <div>
            <IOSLabel>API 密钥</IOSLabel>
            <IOSInput value={view.apiKey} onChange={actions.setConnectionApiKey} type="password" placeholder="sk-..." />
          </div>
          {(!view.base || !view.apiKey) && (
            <EmptyStateCard
              title="连接信息还不完整"
              body="测试连接前需要先补齐接口地址和 API 密钥。"
              action={view.base ? '当前还缺少 API 密钥，填写后即可校验模型发现能力。' : '先填写可访问的接口地址，再补充 API 密钥并执行连接测试。'}
            />
          )}
        </div>
      </SectionCard>

      <SectionCard title="Provider 适配" description="对接非标准 OpenAI 兼容接口时，在这里微调请求协议。" action={<Settings size={14} color={T.text3} />}>
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
            <div>
              <IOSLabel>认证方式</IOSLabel>
              <IOSSelect value={view.providerConfig.authType} onChange={(value) => actions.setProviderAuthType(value as typeof view.providerConfig.authType)}>
                <option value="bearer">Bearer Token</option>
                <option value="api-key">API Key Header</option>
                <option value="custom">自定义 Header</option>
              </IOSSelect>
            </div>
            <div>
              <IOSLabel>模型列表接口</IOSLabel>
              <IOSInput value={view.providerConfig.modelsEndpoint} onChange={actions.setProviderModelsEndpoint} />
            </div>
          </div>
          {view.providerConfig.authType === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div>
                <IOSLabel>Header 名称</IOSLabel>
                <IOSInput value={view.providerConfig.customHeaderName} onChange={actions.setProviderCustomHeaderName} />
              </div>
              <div>
                <IOSLabel>Header 前缀</IOSLabel>
                <IOSInput value={view.providerConfig.customPrefix} onChange={actions.setProviderCustomPrefix} />
              </div>
            </div>
          )}
          <div>
            <IOSLabel>图像请求超时（毫秒）</IOSLabel>
            <IOSInput value={String(view.providerConfig.imageTimeoutMs)} onChange={actions.setProviderImageTimeoutMs} />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
