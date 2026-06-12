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
import { useT } from '@/providers/ThemeContext';
import { DEFAULT_PROVIDER_CONFIG } from '@/shared/providers';
import type { ApiConfig, ModelInfo } from '@/shared/types';
import { IOSButton, IOSInput, IOSLabel } from '@/shared/ui/ios';
import { ArrowRight, CheckCircle2, Database, FolderOpen, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
type Props = {
  activeConfigId: string;
  addLog: (level: string, message: string) => void;
  addNewConfig: () => string;
  apiConfigs: ApiConfig[];
  applyConfig: (id: string) => void;
  onComplete: () => void;
  setApiConfigs: React.Dispatch<React.SetStateAction<ApiConfig[]>>;
  setApiKey: (value: string) => void;
  setBase: (value: string) => void;
  setModels: (models: ModelInfo[]) => void;
};

const panelStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg-secondary)',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.10)',
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
  const T = useT();
  const [storage, setStorage] = useState<StorageSettingsPayload | null>(null);
  const [storageDraft, setStorageDraft] = useState('');
  const [storageBusy, setStorageBusy] = useState(false);
  const [configName, setConfigName] = useState('默认配置');
  const [baseUrl, setBaseUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [testing, setTesting] = useState(false);
  const [testedModels, setTestedModels] = useState<ModelInfo[]>([]);
  const [message, setMessage] = useState('');
  const [guidance, setGuidance] = useState('');

  const activeConfig = useMemo(
    () => apiConfigs.find((config) => config.id === activeConfigId),
    [activeConfigId, apiConfigs],
  );

  useEffect(() => {
    let cancelled = false;
    void loadStorageSettings()
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
  }, []);

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
    if (activeConfig.models?.length) setTestedModels(activeConfig.models);
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
      const selected = await pickStorageDirectory();
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
      let next = storageDraft.trim() ? await saveStorageSettings(storageDraft.trim()) : await resetStorageSettings();
      if (next.restartRequired) {
        const restartResult = await restartBackendRequest();
        if (restartResult.mode === 'desktop') {
          addLog('info', '桌面端已保存数据路径。请关闭并重新打开应用，让新的路径生效。');
        } else if (restartResult.mode === 'desktop-relaunch') {
          addLog('info', '桌面端正在重新启动以应用新的数据路径。');
          return;
        } else {
          await waitForBackendReady({ timeoutMs: 25000, intervalMs: 500 });
          next = (await loadStorageSettings()) || next;
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
      setMessage('请先填写接口地址和 API Key。');
      setGuidance('接口地址通常类似 https://api.example.com/v1，API Key 请使用你自己的服务商密钥。');
      return;
    }

    setTesting(true);
    setMessage('');
    setGuidance('');
    try {
      const result = await testSettingsConnection(
        cleanSecret,
        cleanBase,
        activeConfig?.id,
        activeConfig?.providerConfig as Record<string, unknown> | undefined,
      );
      if (!result.success) throw new Error(result.error || '连接测试失败');
      const nextModels = result.models || [];
      if (nextModels.length === 0) {
        setTestedModels([]);
        setMessage('连接成功，但没有发现可用模型。');
        setGuidance('请确认服务商支持模型列表接口，或稍后在设置页手动添加项目模型；没有模型时模板还不能直接运行。');
        addLog('warn', '首次配置连接成功，但没有发现可用模型');
        return;
      }
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
      setMessage(`连接成功，已发现 ${nextModels.length} 个模型。`);
      setGuidance(
        '当前只保存连接信息和已发现模型，不会自动启用项目模型。请进入设置页的“模型”模块，手动导入你要启用的模型。',
      );
      addLog('success', `首次配置连接成功，发现 ${nextModels.length} 个模型`);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(text);
      setGuidance(getConnectionFailureGuidance(text));
      addLog('error', text);
    } finally {
      setTesting(false);
    }
  };

  const canComplete = Boolean(baseUrl.trim() && secret.trim() && testedModels.length > 0);
  const storageLabel = isServerRuntime
    ? storageDraft || '未设置浏览器自动下载目录，将回退到手动下载'
    : storage?.effectiveRoot || '正在读取默认位置...';
  const chatCount = testedModels.filter((model) => model.cat === 'chat').length;
  const imageCount = testedModels.filter((model) => model.cat === 'image').length;
  const videoCount = testedModels.filter((model) => model.cat === 'video').length;

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        overflow: 'auto',
        background: 'var(--color-bg)',
        color: 'var(--color-text-primary)',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 28px 40px' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 24,
            marginBottom: 24,
          }}
        >
          <div style={{ maxWidth: 680 }}>
            <div
              style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: T.text3 }}
            >
              SueLr Studio
            </div>
            <h1 style={{ margin: '10px 0 10px', fontSize: 34, lineHeight: 1.18, letterSpacing: 0, color: T.text }}>
              开始前，先完成你的本地配置
            </h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: T.text2 }}>
              这里不会内置 API Key 或个人配置。应用只会启动本地服务，并把你的工作流、日志和上传文件保存到外部数据目录。
            </p>
          </div>
          <div style={{ ...panelStyle, padding: 14, minWidth: 220 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.green, fontWeight: 700, fontSize: 13 }}
            >
              <ShieldCheck size={18} />
              纯净封装版
            </div>
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: T.text2 }}>
              无需安装 Node 或后端；首次使用只需要填入你自己的服务配置。
            </div>
          </div>
        </header>

        <main
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)',
            gap: 18,
            alignItems: 'start',
          }}
        >
          <section style={{ ...panelStyle, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <FolderOpen size={18} color={T.blue} />
              <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>数据保存位置</h2>
            </div>

            <div
              style={{
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: T.card2,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 8 }}>
                {isServerRuntime ? '当前浏览器下载目录' : '当前生效路径'}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, overflowWrap: 'anywhere' }}>
                {storageLabel}
              </div>
            </div>

            <IOSLabel>{isServerRuntime ? '浏览器自动下载目录' : '自定义绝对路径'}</IOSLabel>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 10,
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <IOSInput
                value={storageDraft}
                onChange={setStorageDraft}
                placeholder={isServerRuntime ? '授权后用于接收 ?????? 输出的本地下载目录' : '留空则使用默认位置'}
                disabled={isServerRuntime}
              />
              <IOSButton
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
                这里只管理当前浏览器接收 `??????` 输出时的本地自动下载目录，不会修改服务器宿主机路径。
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <IOSButton
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
                <IOSButton
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

          <section style={{ ...panelStyle, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <KeyRound size={18} color={T.green} />
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
                <IOSLabel>配置名称</IOSLabel>
                <IOSInput
                  value={configName}
                  onChange={(value) => {
                    setConfigName(value);
                    updateActiveConfig({ name: value });
                  }}
                />
              </div>
              <div>
                <IOSLabel>接口地址</IOSLabel>
                <IOSInput
                  value={baseUrl}
                  onChange={(value) => {
                    setBaseUrl(value);
                    setBase(value);
                    updateActiveConfig({ base: value });
                  }}
                  placeholder="https://api.example.com/v1"
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <IOSLabel>API Key</IOSLabel>
              <IOSInput
                value={secret}
                onChange={(value) => {
                  setSecret(value);
                  setApiKey(value);
                  updateActiveConfig({ apiKey: value });
                }}
                type="password"
                placeholder="sk-..."
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <IOSButton
                label={testing ? '测试中...' : '测试连接并发现模型'}
                onClick={() => {
                  void testConnection();
                }}
                disabled={testing}
                small
                style={{ width: 'auto' }}
              />
              {testing && <Loader2 size={16} color={T.text2} />}
              {message && (
                <span style={{ fontSize: 12, color: message.includes('成功') ? T.green : T.orange }}>{message}</span>
              )}
            </div>

            {guidance && (
              <div
                style={{
                  borderRadius: 8,
                  border: `1px solid ${canComplete ? `${T.green}44` : `${T.orange}44`}`,
                  background: canComplete ? `${T.green}12` : `${T.orange}12`,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{ fontSize: 12, fontWeight: 700, color: canComplete ? T.green : T.orange, marginBottom: 6 }}
                >
                  {canComplete ? '下一步' : '处理建议'}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text2 }}>{guidance}</div>
              </div>
            )}

            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}
            >
              {[
                ['对话', chatCount, T.blue],
                ['图像', imageCount, T.green],
                ['视频', videoCount, T.purple],
              ].map(([label, count, color]) => (
                <div
                  key={label}
                  style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: T.card2, padding: 12 }}
                >
                  <div style={{ fontSize: 12, color: T.text3 }}>{label}</div>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color: color as string }}>{count}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 14,
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
                {canComplete ? <CheckCircle2 size={16} /> : <Database size={16} />}
                {canComplete ? '连接信息已保存，进入后请到设置里手动启用模型。' : '完成连接测试后即可进入工作台。'}
              </div>
              <IOSButton
                label="进入工作台"
                onClick={onComplete}
                disabled={!canComplete}
                small
                style={{ width: 'auto', padding: '9px 16px' }}
              />
            </div>
          </section>
        </main>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onComplete}
            data-testid="onboarding-skip"
            style={{
              border: 'none',
              background: 'transparent',
              color: T.text3,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
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
  );
}
