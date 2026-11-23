import {
  loadClientDownloadDirectoryState,
  loadStorageSettings,
  pickClientDownloadDirectory,
  pickStorageDirectory,
  resetClientDownloadDirectory,
  resetStorageSettings,
  restartBackendRequest,
  saveStorageSettings,
  testSettingsConnection,
  waitForBackendReady,
} from '@/features/settings';
import type { StorageSettingsPayload } from '@/features/settings';
import { DEFAULT_PROVIDER_CONFIG } from '@/shared/providers';
import type { ApiConfig, ModelInfo } from '@/shared/types';
import { Button, FieldLabel, TextInput } from '@/ui/FormPrimitives';
import { StudioWelcome } from '@/ui/StudioWelcome';
import { themeColors as T, themeTint } from '@/ui/theme';
import { ArrowRight, CheckCircle, Database, FolderOpen, Key } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { type ConnectionTestState, ConnectionTestStatus } from './ConnectionTestStatus';
const projectOnboardingServices = {
  loadStorageSettings,
  pickStorageDirectory,
  saveStorageSettings,
  resetStorageSettings,
  restartBackendRequest,
  waitForBackendReady,
  testSettingsConnection,
};

type Props = {
  services?: typeof projectOnboardingServices;
  activeConfigId: string;
  addLog: (level: string, message: string) => void;
  addNewConfig: () => string;
  apiConfigs: ApiConfig[];
  applyConfig: (id: string) => void;
  onComplete: (openModels?: boolean) => void;
  setApiConfigs: React.Dispatch<React.SetStateAction<ApiConfig[]>>;
  setApiKey: (value: string) => void;
  setBase: (value: string) => void;
  setModels: (models: ModelInfo[]) => void;
};

function getConnectionFailureGuidance(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('remote_host_forbidden') || message.includes('本机') || message.includes('内网')) {
    return '这个地址被安全策略拦截。面向普通使用时请填写公网 HTTPS 服务地址，不要填 localhost、127.0.0.1 或内网 IP。';
  }
  if (lower.includes('timeout') || message.includes('超时') || message.includes('网络')) {
    return '连接超时。请检查网络、代理设置，以及接口地址是否可以在浏览器或命令行中访问。';
  }
  if (
    message.includes('401') ||
    message.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    return '服务拒绝了请求。请确认 API Key 是否正确、是否有余额或权限，以及认证方式是否匹配。';
  }
  if (message.includes('404')) {
    return '接口路径可能不对。通常需要填写服务根地址，例如 https://api.example.com/v1，而不是具体的 chat 或 models 路径。';
  }
  if (message.includes('模型') || lower.includes('model')) {
    return '连接到了服务，但没有拿到可用模型。请确认服务支持 /models，或稍后在设置里手动维护项目模型。';
  }
  return '请检查接口地址、API Key、服务商兼容性和代理设置。修正后可以再次点击测试连接。';
}

export function FirstRunOnboarding({
  services = projectOnboardingServices,
  activeConfigId,
  addLog,
  addNewConfig,
  apiConfigs,
  applyConfig,
  onComplete,
  setApiConfigs,
  setApiKey,
  setBase,
  setModels,
}: Props) {
  const [storage, setStorage] = useState<StorageSettingsPayload | null>(null);
  const [storageDraft, setStorageDraft] = useState('');
  const [storageBusy, setStorageBusy] = useState(false);
  const [configName, setConfigName] = useState('默认配置');
  const [baseUrl, setBaseUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [testedModels, setTestedModels] = useState<ModelInfo[]>([]);
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionTestState>('idle');
  const testing = connectionStatus === 'testing';
  const [message, setMessage] = useState('');
  const [guidance, setGuidance] = useState('');

  const activeConfig = useMemo(
    () => apiConfigs.find((config) => config.id === activeConfigId),
    [activeConfigId, apiConfigs],
  );

  useEffect(() => {
    let cancelled = false;
    void services
      .loadStorageSettings()
      .then((next) => {
        if (cancelled) return;
        setStorage(next);
        setStorageDraft(next?.customRoot || '');
      })
      .catch(() => {
        if (!cancelled) setStorage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [services]);

  useEffect(() => {
    if (activeConfigId) return;
    const id = addNewConfig();
    applyConfig(id);
  }, [activeConfigId, addNewConfig, applyConfig]);

  useEffect(() => {
    if (!activeConfig) return;
    setConfigName(activeConfig.name || '默认配置');
    setBaseUrl(activeConfig.base || '');
    if (activeConfig.apiKey) setSecret(activeConfig.apiKey);
    setTestedModels(activeConfig.models || []);
  }, [activeConfig]);

  const updateActiveConfig = (patch: Partial<ApiConfig>) => {
    const id = activeConfigId || activeConfig?.id;
    if (!id) return;
    setApiConfigs((prev) => prev.map((config) => (config.id === id ? { ...config, ...patch } : config)));
  };

  const isServerRuntime = false;

  const chooseStorage = async () => {
    setStorageBusy(true);
    try {
      if (isServerRuntime) {
        const selected = await pickClientDownloadDirectory();
        if (selected) setStorageDraft(selected.label);
        return;
      }
      const selected = await services.pickStorageDirectory();
      if (selected) setStorageDraft(selected);
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setStorageBusy(false);
    }
  };

  const applyStorage = async () => {
    setStorageBusy(true);
    try {
      if (isServerRuntime) {
        const next = loadClientDownloadDirectoryState();
        setStorageDraft(next?.label || '');
        addLog('success', '浏览器自动下载目录已更新');
        return;
      }
      let next = storageDraft.trim()
        ? await services.saveStorageSettings(storageDraft.trim())
        : await services.resetStorageSettings();
      if (next.restartRequired) {
        const restartResult = await services.restartBackendRequest();
        if (restartResult.mode === 'desktop') {
          addLog('info', '桌面端已保存数据路径。请关闭并重新打开应用，让新的路径生效。');
        } else if (restartResult.mode === 'desktop-relaunch') {
          addLog('info', '桌面端正在重新启动以应用新的数据路径。');
          return;
        } else {
          await services.waitForBackendReady({ timeoutMs: 25000, intervalMs: 500 });
          next = (await services.loadStorageSettings()) || next;
        }
      }
      setStorage(next);
      setStorageDraft(next.customRoot || '');
      addLog('success', '数据路径已准备好');
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : String(error));
    } finally {
      setStorageBusy(false);
    }
  };

  const testConnection = async () => {
    const cleanBase = baseUrl.trim();
    const cleanSecret = secret.trim();
    if (!cleanBase || !cleanSecret) {
      setConnectionStatus('error');
      setMessage('请先填写接口地址和 API Key。');
      setGuidance('接口地址通常类似 https://api.example.com/v1，API Key 请使用你自己的服务商密钥。');
      return;
    }

    setConnectionStatus('testing');
    setConnectionVerified(false);
    setMessage('');
    setGuidance('');
    try {
      const result = await services.testSettingsConnection(
        cleanSecret,
        cleanBase,
        activeConfig?.id,
        activeConfig?.providerConfig as Record<string, unknown> | undefined,
      );
      if (!result.success) throw new Error(result.error || '连接测试失败');
      const nextModels = result.models || [];
      setTestedModels(nextModels);
      setBase(cleanBase);
      setApiKey(cleanSecret);
      setModels(nextModels);
      updateActiveConfig({
        name: configName.trim() || '默认配置',
        base: cleanBase,
        apiKey: cleanSecret,
        models: nextModels,
        providerConfig: activeConfig?.providerConfig || DEFAULT_PROVIDER_CONFIG,
      });
      setConnectionVerified(true);
      setConnectionStatus('success');
      setMessage(nextModels.length ? `连接成功，已发现 ${nextModels.length} 个模型。` : '连接成功，模型列表为空。');
      setGuidance(
        nextModels.length ? '下一步，在项目模型中选择并导入需要的模型。' : '下一步，在项目模型中手动添加可用模型。',
      );
      addLog('success', `首次配置连接成功，发现 ${nextModels.length} 个模型`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setConnectionStatus('error');
      setMessage(text);
      setGuidance(getConnectionFailureGuidance(text));
      addLog('error', text);
    }
  };

  const canComplete = connectionVerified && !testing;
  const storageLabel = isServerRuntime
    ? storageDraft || '未设置浏览器自动下载目录，将回退到手动下载'
    : storage?.effectiveRoot || '正在读取默认位置...';
  const chatCount = testedModels.filter((model) => model.cat === 'chat').length;
  const imageCount = testedModels.filter((model) => model.cat === 'image').length;
  const videoCount = testedModels.filter((model) => model.cat === 'video').length;
  const audioCount = testedModels.filter((model) => model.cat === 'audio').length;

  return (
    <div className="studio-onboarding">
      <div className="studio-onboarding__layout">
        <aside className="studio-onboarding__intro">
          <StudioWelcome compact />
          <ol className="studio-onboarding__steps">
            <li>
              <span>01</span>
              <div>
                <strong>安放你的创作</strong>
                <p>为素材、工作流和生成结果选择保存位置。</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>连接模型服务</strong>
                <p>使用你自己的服务地址与密钥，测试连接。</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>选择创作工具</strong>
                <p>在设置中亲自导入、启用需要的项目模型。</p>
              </div>
            </li>
          </ol>
          <p className="studio-onboarding__privacy">由你选择服务与模型。发现的模型不会自动启用。</p>
        </aside>
        <div className="studio-onboarding__workspace">
          <header className="studio-onboarding__heading">
            <span>欢迎来到你的工作室</span>
            <h2>先准备好，再自由创作</h2>
            <p>完成以下两项设置，或稍后在工作室设置中继续。</p>
          </header>
          <main className="studio-onboarding__panels">
            <section className="studio-onboarding__panel modal-inset-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <FolderOpen size={18} color={T.blue} />
                <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>数据保存位置</h2>
              </div>

              <div
                style={{
                  borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  background: T.card2,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 12, color: T.text3, marginBottom: 8 }}>
                  {isServerRuntime ? '当前浏览器下载目录' : '当前生效路径'}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, overflowWrap: 'anywhere' }}>
                  {storageLabel}
                </div>
              </div>

              <FieldLabel htmlFor="onboarding-storage">
                {isServerRuntime ? '浏览器自动下载目录' : '自定义绝对路径'}
              </FieldLabel>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12,
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <TextInput
                  id="onboarding-storage"
                  value={storageDraft}
                  onChange={setStorageDraft}
                  placeholder={isServerRuntime ? '授权后用于接收生成结果的本地下载目录' : '留空则使用默认位置'}
                  disabled={isServerRuntime}
                />
                <Button
                  label={storageBusy ? '选择中...' : isServerRuntime ? '授权目录' : '选择'}
                  onClick={() => {
                    void chooseStorage();
                  }}
                  disabled={storageBusy}
                  small
                  style={{ width: 72 }}
                />
              </div>
              {isServerRuntime ? (
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6, marginBottom: 12 }}>
                  这里只管理当前浏览器接收生成结果时的本地自动下载目录，不会修改服务器宿主机路径。
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  label={
                    storageBusy
                      ? '处理中...'
                      : isServerRuntime
                        ? '应用目录'
                        : storageDraft.trim()
                          ? '保存并应用路径'
                          : '使用默认位置'
                  }
                  onClick={() => {
                    void applyStorage();
                  }}
                  disabled={storageBusy}
                  small
                  style={{ width: 'auto' }}
                />
                {isServerRuntime ? (
                  <Button
                    label={storageBusy ? '处理中...' : '清除授权'}
                    onClick={() => {
                      void (async () => {
                        setStorageBusy(true);
                        try {
                          await resetClientDownloadDirectory();
                          const next = loadClientDownloadDirectoryState();
                          setStorageDraft(next?.label || '');
                          addLog('success', '浏览器自动下载目录授权已清除');
                        } catch (error) {
                          addLog('error', error instanceof Error ? error.message : String(error));
                        } finally {
                          setStorageBusy(false);
                        }
                      })();
                    }}
                    disabled={storageBusy}
                    small
                    style={{ width: 'auto' }}
                  />
                ) : null}
                <span style={{ fontSize: 12, color: T.text3 }}>之后也可以在设置里修改。</span>
              </div>
            </section>

            <section className="studio-onboarding__panel modal-inset-panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Key size={18} color={T.green} />
                <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>模型服务配置</h2>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <FieldLabel htmlFor="onboarding-name">配置名称</FieldLabel>
                  <TextInput
                    id="onboarding-name"
                    value={configName}
                    onChange={(value) => {
                      setConfigName(value);
                      updateActiveConfig({ name: value });
                    }}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="onboarding-base">接口地址</FieldLabel>
                  <TextInput
                    id="onboarding-base"
                    value={baseUrl}
                    disabled={testing}
                    onChange={(value) => {
                      setConnectionVerified(false);
                      setBaseUrl(value);
                      setBase(value);
                      updateActiveConfig({ base: value, models: [] });
                    }}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <FieldLabel htmlFor="onboarding-key">API Key</FieldLabel>
                <TextInput
                  id="onboarding-key"
                  value={secret}
                  disabled={testing}
                  onChange={(value) => {
                    setConnectionVerified(false);
                    setSecret(value);
                    setApiKey(value);
                    updateActiveConfig({ apiKey: value, models: [] });
                  }}
                  type="password"
                  placeholder="sk-..."
                />
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <Button
                  label={testing ? '测试中...' : '测试连接并发现模型'}
                  onClick={() => {
                    void testConnection();
                  }}
                  disabled={testing}
                  small
                  style={{ width: 'auto' }}
                />
                <ConnectionTestStatus status={connectionStatus} result={message} />
              </div>

              {guidance && (
                <div
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${canComplete ? themeTint(T.green, 27) : themeTint(T.orange, 27)}`,
                    background: canComplete ? themeTint(T.green, 7) : themeTint(T.orange, 7),
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{ fontSize: 12, fontWeight: 700, color: canComplete ? T.green : T.orange, marginBottom: 8 }}
                  >
                    {canComplete ? '下一步' : '处理建议'}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text2 }}>{guidance}</div>
                </div>
              )}

              <div
                style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}
              >
                {[
                  ['对话', chatCount, T.blue],
                  ['图像', imageCount, T.green],
                  ['视频', videoCount, T.purple],
                  ['音频', audioCount, T.orange],
                ].map(([label, count, color]) => (
                  <div
                    key={label}
                    style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: T.card2, padding: 12 }}
                  >
                    <div style={{ fontSize: 12, color: T.text3 }}>{label}</div>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: color as string }}>{count}</div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: canComplete ? T.green : T.text3,
                  }}
                >
                  {canComplete ? <CheckCircle size={16} /> : <Database size={16} />}
                  {canComplete ? '连接信息已保存。' : '测试连接后可继续配置项目模型。'}
                </div>
                <Button
                  label="配置项目模型"
                  onClick={() => onComplete(true)}
                  disabled={!canComplete}
                  small
                  style={{ width: 'auto', padding: '8px 16px' }}
                />
              </div>
            </section>
          </main>

          <div className="studio-onboarding__footer">
            <button
              type="button"
              onClick={() => onComplete()}
              data-testid="onboarding-skip"
              style={{
                border: 'none',
                background: 'transparent',
                color: T.text2,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                padding: 8,
              }}
            >
              我稍后再配置
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
