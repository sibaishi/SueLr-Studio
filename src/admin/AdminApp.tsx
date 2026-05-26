import { useEffect, useMemo, useState } from 'react';
import { Gauge, Globe, KeyRound, Network } from 'lucide-react';
import { useT, TCtx } from '@/providers/ThemeContext';
import { DARK, LIGHT } from '@/app/theme/constants';
import '@/index.css';
import { IOSButton, IOSInput, IOSLabel, IOSSelect } from '@/shared/ui/ios';
import {
  loadAdminSettings,
  saveAdminSettings,
  testAdminSearch,
  validateAdminAccess,
  type AdminSettingsPayload,
} from '@/shared/api/admin';

type AccessState = 'checking' | 'required' | 'ready' | 'denied';

function panelStyle(): React.CSSProperties {
  return {
    background: 'rgba(255,255,255,0.72)',
    border: '1px solid var(--t-border)',
    borderRadius: 24,
    backdropFilter: 'blur(28px)',
    WebkitBackdropFilter: 'blur(28px)',
    boxShadow: '0 18px 48px rgba(0,0,0,0.12)',
  };
}

function chipStyle(color?: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 999,
    border: '1px solid var(--t-border)',
    background: color ? `${color}18` : 'rgba(255,255,255,0.58)',
    color: color || 'var(--t-text2)',
    fontSize: 11,
    fontWeight: 700,
  };
}

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...panelStyle(), padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 14, background: 'rgba(0,122,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-blue)' }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--t-text2)', marginTop: 2 }}>{description}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function AccessGate({
  accessState,
  accessKey,
  setAccessKey,
  handleAccessSubmit,
  message,
}: {
  accessState: AccessState;
  accessKey: string;
  setAccessKey: (value: string) => void;
  handleAccessSubmit: () => Promise<void>;
  message: string;
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ ...panelStyle(), width: '100%', maxWidth: 460, padding: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#111827' }}>SueLr Studio Admin Console</div>
        <div style={{ fontSize: 13, color: '#374151', marginTop: 8 }}>
          独立管理端用于统一配置部署级能力，不承接用户自己的上游 API 与模型设置。
        </div>
        <div style={{ marginTop: 18 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#111827' }}>
            管理员访问密钥
          </label>
          <input
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            type="password"
            placeholder="server-web 需要，local-web / desktop 可留空"
            style={{
              width: '100%',
              height: 44,
              borderRadius: 14,
              border: '1px solid #d1d5db',
              background: '#ffffff',
              color: '#111827',
              padding: '0 14px',
              fontSize: 14,
              boxSizing: 'border-box',
              outline: 'none',
              WebkitTextFillColor: '#111827',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <IOSButton label={accessState === 'checking' ? '校验中...' : '进入管理端'} onClick={() => void handleAccessSubmit()} />
        </div>
        {message ? <div style={{ marginTop: 12, fontSize: 12, color: '#b91c1c' }}>{message}</div> : null}
      </div>
    </div>
  );
}

function AdminScreen() {
  const T = useT();
  const [themeMode] = useState<'light' | 'dark'>('light');
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [accessKey, setAccessKey] = useState('');
  const [settings, setSettings] = useState<AdminSettingsPayload | null>(null);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchProvider, setSearchProvider] = useState('tavily');
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [proxyMode, setProxyMode] = useState<'system' | 'direct' | 'custom'>('system');
  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('');
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const theme = themeMode === 'dark' ? DARK : LIGHT;

  const load = async (nextAccessKey?: string) => {
    const access = await validateAdminAccess(nextAccessKey);
    if (!access.valid) {
      setAccessState(access.requiresAccessKey ? 'denied' : 'required');
      return;
    }

    setAccessState('ready');
    const next = await loadAdminSettings(nextAccessKey);
    setSettings(next);
    setSearchEnabled(next.search.enabled);
    setSearchProvider(next.search.provider);
    setProxyMode(next.network.outboundProxy.mode);
    setNoProxy(next.network.outboundProxy.noProxy || '');
    setFeatureEnabled(next.features.adminConsoleEnabled);
  };

  useEffect(() => {
    void load().catch(() => setAccessState('required'));
  }, []);

  const statusChips = useMemo(() => {
    return [
      { label: searchEnabled ? '联网搜索已启用' : '联网搜索已关闭', color: searchEnabled ? T.purple : undefined },
      { label: `Provider: ${searchProvider}`, color: T.blue },
      { label: `代理模式: ${proxyMode}`, color: T.green },
    ];
  }, [T.blue, T.green, T.purple, proxyMode, searchEnabled, searchProvider]);

  const handleAccessSubmit = async () => {
    setAccessState('checking');
    setMessage('');
    try {
      await load(accessKey);
    } catch (error) {
      setAccessState('denied');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const next = await saveAdminSettings({
        search: {
          enabled: searchEnabled,
          provider: searchProvider,
          providerConfig: {
            ...(tavilyApiKey ? { tavilyApiKey } : {}),
          },
        },
        network: {
          outboundProxy: {
            mode: proxyMode,
            ...(proxyMode === 'custom' ? { httpProxy, httpsProxy, noProxy } : { noProxy }),
          },
        },
        features: {
          adminConsoleEnabled: featureEnabled,
        },
      }, accessKey || undefined);
      setSettings(next);
      setMessage('管理员配置已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleTestSearch = async () => {
    setMessage('');
    const result = await testAdminSearch(accessKey || undefined);
    const successMessage = result.success && result.data && typeof result.data === 'object' && 'message' in result.data
      ? String((result.data as { message?: string }).message || '搜索测试成功')
      : '搜索测试成功';
    setMessage(result.success ? successMessage : (result.error || '搜索测试失败'));
  };

  if (accessState !== 'ready') {
    return (
      <AccessGate
        accessState={accessState}
        accessKey={accessKey}
        setAccessKey={setAccessKey}
        handleAccessSubmit={handleAccessSubmit}
        message={message}
      />
    );
  }

  return (
    <TCtx.Provider value={theme}>
      <div data-theme={themeMode} style={{ minHeight: '100vh', padding: 24, overflow: 'auto' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18 }}>
          <header style={{ ...panelStyle(), padding: 22, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-text2)' }}>Separate Admin Console</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--t-text)', marginTop: 6 }}>部署级统一配置</div>
              <div style={{ fontSize: 13, color: 'var(--t-text2)', marginTop: 8, maxWidth: 620 }}>
                这里控制联网搜索总闸、统一搜索凭据、代理配置和少量部署开关。用户自己的 Base URL、API Key、模型发现与启停仍留在主应用设置页。
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              {statusChips.map((item) => <span key={item.label} style={chipStyle(item.color)}>{item.label}</span>)}
            </div>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 18 }}>
            <Section title="搜索服务" description="部署级联网搜索总闸与统一凭据。" icon={<Globe size={18} />}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <IOSLabel>联网搜索总开关</IOSLabel>
                    <IOSSelect value={searchEnabled ? 'on' : 'off'} onChange={(value) => setSearchEnabled(value === 'on')}>
                      <option value="on">启用</option>
                      <option value="off">关闭</option>
                    </IOSSelect>
                  </div>
                  <div>
                    <IOSLabel>搜索提供商</IOSLabel>
                    <IOSSelect value={searchProvider} onChange={setSearchProvider}>
                      <option value="tavily">Tavily</option>
                    </IOSSelect>
                  </div>
                </div>
                <div>
                  <IOSLabel>Tavily API Key</IOSLabel>
                  <IOSInput value={tavilyApiKey} onChange={setTavilyApiKey} type="password" placeholder={settings?.search.providerConfig.tavilyApiKeySet ? '已配置，留空表示沿用已存储密钥' : 'tvly-...'} />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <IOSButton label="测试搜索" onClick={() => void handleTestSearch()} />
                  <span style={chipStyle(settings?.search.providerConfig.tavilyApiKeySet ? T.green : '#f59e0b')}>
                    {settings?.search.providerConfig.tavilyApiKeySet ? '统一凭据已配置' : '统一凭据未配置'}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="网络与代理" description="统一的出站代理配置。" icon={<Network size={18} />}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <IOSLabel>代理模式</IOSLabel>
                  <IOSSelect value={proxyMode} onChange={(value) => setProxyMode(value as 'system' | 'direct' | 'custom')}>
                    <option value="system">跟随系统</option>
                    <option value="direct">直连</option>
                    <option value="custom">自定义</option>
                  </IOSSelect>
                </div>
                {proxyMode === 'custom' ? (
                  <>
                    <div>
                      <IOSLabel>HTTP Proxy</IOSLabel>
                      <IOSInput value={httpProxy} onChange={setHttpProxy} placeholder="http://host:port" />
                    </div>
                    <div>
                      <IOSLabel>HTTPS Proxy</IOSLabel>
                      <IOSInput value={httpsProxy} onChange={setHttpsProxy} placeholder="http://host:port" />
                    </div>
                  </>
                ) : null}
                <div>
                  <IOSLabel>No Proxy</IOSLabel>
                  <IOSInput value={noProxy} onChange={setNoProxy} placeholder="127.0.0.1,localhost,.internal" />
                </div>
              </div>
            </Section>
          </div>

          <Section title="部署能力" description="第一版只保留少量部署级开关，为后续管理员后台扩展预留位置。" icon={<Gauge size={18} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>管理端可用</div>
                <div style={{ fontSize: 12, color: 'var(--t-text2)', marginTop: 4 }}>关闭后可保留后端接口能力，但管理端入口会标记为禁用。</div>
              </div>
              <IOSSelect value={featureEnabled ? 'on' : 'off'} onChange={(value) => setFeatureEnabled(value === 'on')}>
                <option value="on">启用</option>
                <option value="off">关闭</option>
              </IOSSelect>
            </div>
          </Section>

          <footer style={{ ...panelStyle(), padding: 18, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(52,199,89,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-green)' }}>
                <KeyRound size={16} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text2)' }}>
                {message || '保存后主应用会直接读取新的部署级搜索与代理配置。'}
              </div>
            </div>
            <IOSButton label={saving ? '保存中...' : '保存管理员配置'} onClick={() => void handleSave()} />
          </footer>
        </div>
      </div>
    </TCtx.Provider>
  );
}

export default function AdminApp() {
  return <AdminScreen />;
}
