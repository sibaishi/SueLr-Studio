import { ErrorBoundary } from '@/app/bootstrap/ErrorBoundary';
import type { ModelOption } from '@/domains/workflow/lib/projectModels';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { useStudioSettingsState } from '@/features/settings';
import { TCtx } from '@/providers/ThemeContext';
import { ToastProvider } from '@/providers/ToastContext';
import { getModelDisplayName, getModelGroupName } from '@/shared/providers/model-routing';
import { SplashScreen } from '@/shared/ui/ios';
import { ModalSurface } from '@/ui/ModalSurface';
import { type ReactNode, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useAppBootstrap } from './bootstrap/useAppBootstrap';
import { useThemeState } from './theme/useThemeState';
import '@/domains/workflow/index.css';

import WorkflowPage from '@/domains/workflow/App';
const SettingsPanel = lazy(() =>
  import('@/features/settings/components/SettingsPanel').then((module) => ({ default: module.SettingsPanel })),
);
const FirstRunOnboarding = lazy(() =>
  import('@/features/settings/components/FirstRunOnboarding').then((module) => ({
    default: module.FirstRunOnboarding,
  })),
);

function BootstrapBlocker({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div
      data-testid="bootstrap-blocker"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        color: 'rgba(255, 255, 255, 0.86)',
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.14)',
          background: 'rgba(15, 23, 42, 0.72)',
          padding: 24,
          textAlign: 'center',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.24)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>无法确认登录状态</div>
        <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7, color: 'rgba(255, 255, 255, 0.68)' }}>
          {message || '请刷新页面后重试。'}
        </div>
        <button
          type="button"
          data-testid="bootstrap-retry"
          onClick={onRetry}
          style={{
            marginTop: 18,
            border: 0,
            borderRadius: 12,
            background: '#38bdf8',
            color: '#082f49',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            padding: '10px 16px',
          }}
        >
          重试
        </button>
      </div>
    </div>
  );
}

function SettingsModal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <ModalSurface
      ariaLabel="工作室设置"
      rootClassName="settings-modal"
      panelClassName="settings-modal__panel"
      backdropClassName="settings-modal__backdrop"
      backdropLabel="关闭设置"
      onClose={onClose}
    >
      {children}
    </ModalSurface>
  );
}

export default function App() {
  const hydratedRef = useRef(false);
  const { colors, themeMode, setThemeMode } = useThemeState();
  const settings = useStudioSettingsState();
  const workflowBusy = useWorkflowStore((state) => state.isExecuting);
  const [settingsModule, setSettingsModule] = useState<'overview' | 'connection' | 'models' | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem('suelr_onboarding_dismissed') === 'true',
  );
  const projectBusy = workflowBusy;

  const [splashHidden, setSplashHidden] = useState(false);
  const { bootstrapError, bootstrapMode, runtimeCapabilities, splashDone } = useAppBootstrap({
    hydratedRef,
    setThemeMode,
    settings,
    themeMode,
  });
  const hasUsableConfig = settings.apiConfigs.some(
    (config) =>
      Boolean(config.base && (config.apiKey || config.apiKeySet)) &&
      (config.projectModels || []).some((model) => model.configured),
  );
  const canEnterWorkspace = Boolean(bootstrapMode === 'browser-only' || runtimeCapabilities);
  const showBootstrapBlocker = Boolean(splashHidden && !canEnterWorkspace);
  const showOnboarding = canEnterWorkspace && splashHidden && !hasUsableConfig && !onboardingDismissed;

  const handleToggleTheme = () => {
    const modes = ['dark', 'light', 'system'] as const;
    setThemeMode(modes[(modes.indexOf(themeMode) + 1) % modes.length]);
  };

  useEffect(() => {
    const grouped: Record<'all' | 'chat' | 'image' | 'video' | 'audio' | 'midjourney', ModelOption[]> = {
      all: [],
      chat: [],
      image: [],
      video: [],
      audio: [],
      midjourney: [],
    };
    for (const model of settings.configuredProjectModels) {
      const option = {
        label: getModelDisplayName(model),
        value: model.id,
        modelId: getModelDisplayName(model),
        configId: model.configId,
        group: getModelGroupName(model),
      };
      grouped.all.push(option);
      grouped[model.cat].push(option);
    }
    useWorkflowStore.getState().setProjectModels(settings.apiConfigs.flatMap((c) => c.projectModels || []));
    useWorkflowStore.getState().setAvailableModels(grouped);
    useWorkflowStore.setState({ workflowRuntimeConfigs: settings.apiConfigs });
  }, [settings.apiConfigs, settings.configuredProjectModels]);

  useEffect(() => {
    useWorkflowStore.setState({ edgeStyle: settings.edgeStyle });
  }, [settings.edgeStyle]);

  return (
    <TCtx.Provider value={colors}>
      <ToastProvider>
        {!splashHidden && <SplashScreen done={splashDone} onHidden={() => setSplashHidden(true)} />}
        {showBootstrapBlocker && (
          <BootstrapBlocker
            message={bootstrapError}
            onRetry={() => {
              window.location.reload();
            }}
          />
        )}
        {showOnboarding && (
          <Suspense fallback={null}>
            <FirstRunOnboarding
              activeConfigId={settings.activeConfigId}
              addLog={settings.addLog}
              addNewConfig={settings.addNewConfig}
              apiConfigs={settings.apiConfigs}
              applyConfig={settings.applyConfig}
              onComplete={(openModels) => {
                if (openModels) setSettingsModule('models');
                localStorage.setItem('suelr_onboarding_dismissed', 'true');
                setOnboardingDismissed(true);
              }}
              setApiConfigs={settings.setApiConfigs}
              setApiKey={settings.setApiKey}
              setBase={settings.setBase}
              setModels={settings.setModels}
            />
          </Suspense>
        )}
        {canEnterWorkspace && !showOnboarding && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100vh',
              fontFamily: 'var(--font-sans)',
              background: 'transparent',
              color: colors.text,
              minWidth: 1280,
              position: 'relative',
            }}
          >
            <ErrorBoundary>
              <WorkflowPage
                onOpenStudioSettings={(module) => setSettingsModule(module ?? 'overview')}
                onToggleTheme={handleToggleTheme}
                themeMode={themeMode}
              />
            </ErrorBoundary>

            {settingsModule && (
              <SettingsModal onClose={() => setSettingsModule(null)}>
                <ErrorBoundary>
                  <Suspense fallback={null}>
                    <SettingsPanel
                      initialModule={settingsModule}
                      apiConfigs={settings.apiConfigs}
                      setApiConfigs={settings.setApiConfigs}
                      activeConfigId={settings.activeConfigId}
                      setActiveConfigId={settings.setActiveConfigId}
                      applyConfig={settings.applyConfig}
                      addNewConfig={settings.addNewConfig}
                      deleteConfig={settings.deleteConfig}
                      toggleConfigEnabled={settings.toggleConfigEnabled}
                      base={settings.base}
                      apiKey={settings.apiKey}
                      setBase={settings.setBase}
                      setApiKey={settings.setApiKey}
                      models={settings.models}
                      setModels={settings.setModels}
                      addLog={settings.addLog}
                      logs={settings.logs}
                      onClearLogs={settings.clearLogs}
                      themeMode={themeMode}
                      setThemeMode={setThemeMode}
                      edgeStyle={settings.edgeStyle}
                      setEdgeStyle={settings.setEdgeStyle}
                      workflowConcurrency={settings.workflowConcurrency}
                      setWorkflowConcurrency={settings.setWorkflowConcurrency}
                      projectBusy={projectBusy}
                    />
                  </Suspense>
                </ErrorBoundary>
              </SettingsModal>
            )}

          </div>
        )}
      </ToastProvider>
    </TCtx.Provider>
  );
}
