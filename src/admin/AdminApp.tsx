import { DARK, LIGHT } from '@/app/theme/constants';
import { TCtx, useT } from '@/providers/ThemeContext';
import {
  type AdminSettingsPayload,
  type AdminUser,
  type PasswordResetRequest,
  approveAdminUser,
  disableAdminUser,
  enableAdminUser,
  issuePasswordResetRequest,
  loadAdminSettings,
  loadAdminUsers,
  loadPasswordResetRequests,
  rejectAdminUser,
  revokePasswordResetRequest,
  saveAdminSettings,
  testAdminEmail,
  testAdminSearch,
  validateAdminAccess,
} from '@/shared/api/admin';
import { IOSButton, IOSInput, IOSLabel, IOSSelect } from '@/shared/ui/ios';
import { Gauge, Globe, KeyRound, Mail, Network, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import '@/index.css';

type AccessState = 'checking' | 'required' | 'ready' | 'denied';

const STATUS_LABELS: Record<AdminUser['status'], string> = {
  pending: '待审核',
  active: '已启用',
  rejected: '已拒绝',
  disabled: '已停用',
};

function panelStyle(): React.CSSProperties {
  return {
    background: 'rgba(255,255,255,0.72)',
    border: '1px solid var(--t-border)',
    borderRadius: 20,
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
    whiteSpace: 'nowrap',
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
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'rgba(0,122,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--t-blue)',
            flex: '0 0 auto',
          }}
        >
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
          独立管理端用于部署级设置和用户审核，不使用普通用户登录凭证。
        </div>
        <div style={{ marginTop: 18 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#111827' }}>
            管理员访问密钥
          </label>
          <input
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            type="password"
            placeholder="server-web 必填"
            style={{
              width: '100%',
              height: 44,
              borderRadius: 12,
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
          <IOSButton
            label={accessState === 'checking' ? '校验中...' : '进入管理端'}
            onClick={() => void handleAccessSubmit()}
          />
        </div>
        {message ? <div style={{ marginTop: 12, fontSize: 12, color: '#b91c1c' }}>{message}</div> : null}
      </div>
    </div>
  );
}

function UserTable({
  users,
  accessKey,
  onChanged,
}: {
  users: AdminUser[];
  accessKey?: string;
  onChanged: () => Promise<void>;
}) {
  const run = async (action: () => Promise<unknown>) => {
    await action();
    await onChanged();
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {users.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t-text2)', padding: '12px 0' }}>暂无用户</div>
      ) : (
        users.map((user) => (
          <div
            key={user.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(180px, 1fr) 120px minmax(220px, auto)',
              gap: 12,
              alignItems: 'center',
              padding: 12,
              border: '1px solid var(--t-border)',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.52)',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>{user.username}</div>
              <div style={{ fontSize: 12, color: 'var(--t-text2)', marginTop: 3 }}>
                {user.email || '未填写邮箱'} · {user.workspaceId}
              </div>
            </div>
            <span style={chipStyle()}>{STATUS_LABELS[user.status]}</span>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {user.status === 'pending' ? (
                <>
                  <IOSButton label="通过" onClick={() => void run(() => approveAdminUser(user.id, accessKey))} />
                  <IOSButton label="拒绝" onClick={() => void run(() => rejectAdminUser(user.id, accessKey))} />
                </>
              ) : null}
              {user.status === 'active' ? (
                <IOSButton label="停用" onClick={() => void run(() => disableAdminUser(user.id, accessKey))} />
              ) : null}
              {user.status === 'disabled' ? (
                <IOSButton label="启用" onClick={() => void run(() => enableAdminUser(user.id, accessKey))} />
              ) : null}
              {user.status === 'rejected' ? (
                <IOSButton label="重新启用" onClick={() => void run(() => enableAdminUser(user.id, accessKey))} />
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function AdminScreen() {
  const T = useT();
  const [themeMode] = useState<'light' | 'dark'>('light');
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [accessKey, setAccessKey] = useState('');
  const [settings, setSettings] = useState<AdminSettingsPayload | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [searchProvider, setSearchProvider] = useState('tavily');
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [proxyMode, setProxyMode] = useState<'system' | 'direct' | 'custom'>('system');
  const [httpProxy, setHttpProxy] = useState('');
  const [httpsProxy, setHttpsProxy] = useState('');
  const [noProxy, setNoProxy] = useState('');
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [emailProvider, setEmailProvider] = useState<'none' | 'smtp'>('none');
  const [emailFrom, setEmailFrom] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [testEmailTo, setTestEmailTo] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const theme = themeMode === 'dark' ? DARK : LIGHT;

  const loadUsers = async (nextAccessKey = accessKey) => {
    const [pending, active, disabled, rejected] = await Promise.all([
      loadAdminUsers(nextAccessKey, 'pending'),
      loadAdminUsers(nextAccessKey, 'active'),
      loadAdminUsers(nextAccessKey, 'disabled'),
      loadAdminUsers(nextAccessKey, 'rejected'),
    ]);
    setUsers([...pending.users, ...active.users, ...disabled.users, ...rejected.users]);
  };

  const loadResetRequests = async (nextAccessKey = accessKey) => {
    const next = await loadPasswordResetRequests(nextAccessKey);
    setResetRequests(next.requests);
  };

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
    setEmailProvider(next.email.provider);
    setEmailFrom(next.email.from || '');
    setSmtpPort(String(next.email.smtp.port || 587));
    setSmtpSecure(Boolean(next.email.smtp.secure));
    await Promise.all([loadUsers(nextAccessKey || ''), loadResetRequests(nextAccessKey || '')]);
  };

  useEffect(() => {
    void load().catch(() => setAccessState('required'));
  }, []);

  const statusChips = useMemo(() => {
    const pendingCount = users.filter((user) => user.status === 'pending').length;
    return [
      { label: searchEnabled ? '联网搜索已启用' : '联网搜索已关闭', color: searchEnabled ? T.purple : undefined },
      { label: `Provider: ${searchProvider}`, color: T.blue },
      { label: `待审核: ${pendingCount}`, color: pendingCount > 0 ? '#f59e0b' : T.green },
    ];
  }, [T.blue, T.green, T.purple, searchEnabled, searchProvider, users]);

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
      const next = await saveAdminSettings(
        {
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
          email: {
            provider: emailProvider,
            from: emailFrom,
            smtp: {
              ...(smtpHost ? { host: smtpHost } : {}),
              port: Number(smtpPort) || 587,
              secure: smtpSecure,
              ...(smtpUser ? { user: smtpUser } : {}),
              ...(smtpPass ? { pass: smtpPass } : {}),
            },
          },
        },
        accessKey || undefined,
      );
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
    const successMessage =
      result.success && result.data && typeof result.data === 'object' && 'message' in result.data
        ? String((result.data as { message?: string }).message || '搜索测试成功')
        : '搜索测试成功';
    setMessage(result.success ? successMessage : result.error || '搜索测试失败');
  };

  const handleTestEmail = async () => {
    setMessage('');
    const result = await testAdminEmail(accessKey || undefined, testEmailTo);
    const payload = result.data as { message?: string; error?: string } | undefined;
    setMessage(result.success ? payload?.message || '测试邮件已发送' : result.error || payload?.error || '测试邮件发送失败');
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
          <header
            style={{
              ...panelStyle(),
              padding: 22,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: 'var(--t-text2)',
                }}
              >
                Separate Admin Console
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--t-text)', marginTop: 6 }}>部署管理</div>
              <div style={{ fontSize: 13, color: 'var(--t-text2)', marginTop: 8, maxWidth: 640 }}>
                管理部署级搜索、代理、用户审核和账号启停。管理员密钥不作为普通用户登录凭证。
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              {statusChips.map((item) => (
                <span key={item.label} style={chipStyle(item.color)}>
                  {item.label}
                </span>
              ))}
            </div>
          </header>

          <Section title="用户审核" description="审核注册申请并管理账号状态。" icon={<UserCheck size={18} />}>
            <UserTable users={users} accessKey={accessKey || undefined} onChanged={() => loadUsers(accessKey || '')} />
          </Section>

          <Section title="密码重置" description="签发一次性重置 token，手动发送给用户。" icon={<KeyRound size={18} />}>
            <div style={{ display: 'grid', gap: 8 }}>
              {resetRequests.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--t-text2)', padding: '12px 0' }}>暂无重置申请</div>
              ) : (
                resetRequests.map((request) => (
                  <div
                    key={request.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(180px, 1fr) 120px minmax(220px, auto)',
                      gap: 12,
                      alignItems: 'center',
                      padding: 12,
                      border: '1px solid var(--t-border)',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.52)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>{request.username}</div>
                      <div style={{ fontSize: 12, color: 'var(--t-text2)', marginTop: 3 }}>{request.email || '未填写邮箱'}</div>
                    </div>
                    <span style={chipStyle()}>{request.status}</span>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {request.status === 'pending' || request.status === 'issued' ? (
                        <>
                          <IOSButton
                            label="签发"
                            onClick={() =>
                              void issuePasswordResetRequest(request.id, accessKey || undefined).then((result) => {
                                setMessage(result.token ? `重置 token：${result.token}` : '重置 token 已签发');
                                return loadResetRequests(accessKey || '');
                              })
                            }
                          />
                          <IOSButton
                            label="撤销"
                            onClick={() =>
                              void revokePasswordResetRequest(request.id, accessKey || undefined).then(() =>
                                loadResetRequests(accessKey || ''),
                              )
                            }
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 18 }}>
            <Section title="搜索服务" description="部署级联网搜索总开关与统一凭据。" icon={<Globe size={18} />}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <IOSLabel>联网搜索</IOSLabel>
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
                  <IOSInput
                    value={tavilyApiKey}
                    onChange={setTavilyApiKey}
                    type="password"
                    placeholder={settings?.search.providerConfig.tavilyApiKeySet ? '已配置，留空沿用' : 'tvly-...'}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <IOSButton label="测试搜索" onClick={() => void handleTestSearch()} />
                  <span style={chipStyle(settings?.search.providerConfig.tavilyApiKeySet ? T.green : '#f59e0b')}>
                    {settings?.search.providerConfig.tavilyApiKeySet ? '统一凭据已配置' : '统一凭据未配置'}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="网络代理" description="统一的出站代理配置。" icon={<Network size={18} />}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <IOSLabel>代理模式</IOSLabel>
                  <IOSSelect
                    value={proxyMode}
                    onChange={(value) => setProxyMode(value as 'system' | 'direct' | 'custom')}
                  >
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

          <Section title="部署能力" description="少量部署级开关。" icon={<Gauge size={18} />}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>管理端可用</div>
                <div style={{ fontSize: 12, color: 'var(--t-text2)', marginTop: 4 }}>
                  关闭后管理端入口会被标记为禁用，后端接口仍由管理员密钥保护。
                </div>
              </div>
              <IOSSelect value={featureEnabled ? 'on' : 'off'} onChange={(value) => setFeatureEnabled(value === 'on')}>
                <option value="on">启用</option>
                <option value="off">关闭</option>
              </IOSSelect>
            </div>
          </Section>

          <Section title="邮件通知" description="可选 SMTP 通知，未配置时账号流程仍会正常继续。" icon={<Mail size={18} />}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <IOSLabel>邮件提供方</IOSLabel>
                  <IOSSelect value={emailProvider} onChange={(value) => setEmailProvider(value as 'none' | 'smtp')}>
                    <option value="none">不启用</option>
                    <option value="smtp">SMTP</option>
                  </IOSSelect>
                </div>
                <div>
                  <IOSLabel>发件人</IOSLabel>
                  <IOSInput value={emailFrom} onChange={setEmailFrom} placeholder="SueLr Studio <no-reply@example.com>" />
                </div>
              </div>
              {emailProvider === 'smtp' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px', gap: 12 }}>
                    <div>
                      <IOSLabel>SMTP Host</IOSLabel>
                      <IOSInput
                        value={smtpHost}
                        onChange={setSmtpHost}
                        placeholder={settings?.email.smtp.hostSet ? '已配置，留空沿用' : 'smtp.example.com'}
                      />
                    </div>
                    <div>
                      <IOSLabel>SMTP Port</IOSLabel>
                      <IOSInput value={smtpPort} onChange={setSmtpPort} placeholder="587" />
                    </div>
                    <div>
                      <IOSLabel>加密</IOSLabel>
                      <IOSSelect value={smtpSecure ? 'true' : 'false'} onChange={(value) => setSmtpSecure(value === 'true')}>
                        <option value="false">STARTTLS</option>
                        <option value="true">TLS</option>
                      </IOSSelect>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <IOSLabel>SMTP User</IOSLabel>
                      <IOSInput
                        value={smtpUser}
                        onChange={setSmtpUser}
                        placeholder={settings?.email.smtp.userSet ? '已配置，留空沿用' : 'user@example.com'}
                      />
                    </div>
                    <div>
                      <IOSLabel>SMTP Pass</IOSLabel>
                      <IOSInput
                        value={smtpPass}
                        onChange={setSmtpPass}
                        type="password"
                        placeholder={settings?.email.smtp.passSet ? '已配置，留空沿用' : 'password'}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <IOSLabel>测试收件人</IOSLabel>
                  <IOSInput value={testEmailTo} onChange={setTestEmailTo} placeholder="admin@example.com" />
                </div>
                <IOSButton label="测试邮件" onClick={() => void handleTestEmail()} />
                <span style={chipStyle(emailProvider === 'smtp' && settings?.email.smtp.hostSet ? T.green : '#f59e0b')}>
                  {emailProvider === 'smtp' && settings?.email.smtp.hostSet ? 'SMTP 已配置' : '邮件未配置'}
                </span>
              </div>
            </div>
          </Section>

          <footer
            style={{
              ...panelStyle(),
              padding: 18,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: 'rgba(52,199,89,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--t-green)',
                }}
              >
                <KeyRound size={16} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text2)' }}>{message || '保存后主应用会读取新的部署级配置。'}</div>
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
