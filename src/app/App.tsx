import { ErrorBoundary } from '@/app/bootstrap/ErrorBoundary';
import { useWorkflowPageCommands } from '@/domains/workflow/hooks/useWorkflowPageCommands';
import type { ModelOption } from '@/domains/workflow/lib/projectModels';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { AgentWorkspace } from '@/features/agent';
import { useStudioSettingsState } from '@/features/settings';
import { TCtx } from '@/providers/ThemeContext';
import { ToastProvider } from '@/providers/ToastContext';
import { useMemory } from '@/shared/hooks/useMemory';
import { getModelDisplayName, getModelGroupName } from '@/shared/providers/model-routing';
import { SplashScreen } from '@/shared/ui/ios';
import { type ReactNode, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useAppBootstrap } from './bootstrap/useAppBootstrap';
import { useThemeState } from './theme/useThemeState';
import '@/domains/workflow/index.css';

const WorkflowPage = lazy(() => import('@/domains/workflow/App'));
const SettingsPanel = lazy(() =>
  import('@/features/settings/components/SettingsPanel').then((module) => ({ default: module.SettingsPanel })),
);
const FirstRunOnboarding = lazy(() =>
  import('@/features/settings/components/FirstRunOnboarding').then((module) => ({
    default: module.FirstRunOnboarding,
  })),
);

function WorkspaceLoading() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div className="loading-shimmer" style={{ height: 40, width: '35%', borderRadius: 12 }} />
      <div className="loading-shimmer" style={{ height: 16, width: '80%', borderRadius: 6 }} />
      <div className="loading-shimmer" style={{ height: 16, width: '60%', borderRadius: 6 }} />
      <div className="loading-shimmer" style={{ height: 140, width: '100%', borderRadius: 14 }} />
    </div>
  );
}

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
    <div className="settings-modal" role="dialog" aria-modal="true" aria-label="工作室设置">
      <button type="button" className="settings-modal__backdrop" aria-label="关闭设置" onClick={onClose} />
      <div className="settings-modal__panel">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const hydratedRef = useRef(false);
  const { colors, themeMode, setThemeMode } = useThemeState();
  const settings = useStudioSettingsState();
  const memory = useMemory();
  const workflowBusy = useWorkflowStore((state) => state.isExecuting);
  const workflowStore = useWorkflowStore();
  const { handleBackfillImageToCanvas, handleBackfillVideoToCanvas } = useWorkflowPageCommands({
    store: workflowStore,
    confirmDiscardChanges: () => true,
    resetHistory: () => {},
    setWorkflowErrorMessage: () => {},
  });
  const [agentOpen, setAgentOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem('suelr_onboarding_dismissed') === 'true',
  );
  const projectBusy = workflowBusy;

  const { bootstrapError, bootstrapMode, runtimeCapabilities, splashFading, splashHidden } = useAppBootstrap({
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
    const grouped: Record<'all' | 'chat' | 'image' | 'video', ModelOption[]> = {
      all: [],
      chat: [],
      image: [],
      video: [],
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
    useWorkflowStore.getState().setAvailableModels(grouped);
    useWorkflowStore.setState({ workflowRuntimeConfigs: settings.apiConfigs });
  }, [settings.apiConfigs, settings.configuredProjectModels]);

  return (
    <TCtx.Provider value={colors}>
      <ToastProvider>
        {!splashHidden && <SplashScreen fading={splashFading} />}
        {showBootstrapBlocker && (
          <BootstrapBlocker
            message={bootstrapError}
            onRetry={() => {
              window.location.reload();
            }}
          />
        )}
        {showOnboarding && (
          <Suspense fallback={<WorkspaceLoading />}>
            <FirstRunOnboarding
              activeConfigId={settings.activeConfigId}
              addLog={settings.addLog}
              addNewConfig={settings.addNewConfig}
              apiConfigs={settings.apiConfigs}
              applyConfig={settings.applyConfig}
              onComplete={() => {
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
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
              background: 'transparent',
              color: colors.text,
              minWidth: 1280,
              position: 'relative',
            }}
          >
            <ErrorBoundary>
              <Suspense fallback={<WorkspaceLoading />}>
                <WorkflowPage
                  onOpenStudioSettings={() => setSettingsOpen(true)}
                  onOpenAgent={() => setAgentOpen(true)}
                  onToggleTheme={handleToggleTheme}
                  themeMode={themeMode}
                />
              </Suspense>
            </ErrorBoundary>

            {settingsOpen && (
              <SettingsModal onClose={() => setSettingsOpen(false)}>
                <ErrorBoundary>
                  <Suspense fallback={<WorkspaceLoading />}>
                    <SettingsPanel
                      apiConfigs={settings.apiConfigs}
                      setApiConfigs={settings.setApiConfigs}
                      activeConfigId={settings.activeConfigId}
                      setActiveConfigId={settings.setActiveConfigId}
                      applyConfig={settings.applyConfig}
                      addNewConfig={settings.addNewConfig}
                      deleteConfig={settings.deleteConfig}
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
                      agentProfiles={settings.agentProfiles}
                      customAgentProfiles={settings.customAgentProfiles}
                      upsertAgentProfile={settings.upsertAgentProfile}
                      deleteAgentProfile={settings.deleteAgentProfile}
                      memories={memory.memories}
                      onDeleteMemory={memory.deleteMemory}
                      onClearMemories={memory.clearMemories}
                      exportMemories={memory.exportMemories}
                      workflowConcurrency={settings.workflowConcurrency}
                      setWorkflowConcurrency={settings.setWorkflowConcurrency}
                      projectBusy={projectBusy}
                    />
                  </Suspense>
                </ErrorBoundary>
              </SettingsModal>
            )}

            <AgentWorkspace
              open={agentOpen}
              onClose={() => setAgentOpen(false)}
              onOpenWorkflow={() => setAgentOpen(false)}
              onBackfillImageToCanvas={handleBackfillImageToCanvas}
              onBackfillVideoToCanvas={handleBackfillVideoToCanvas}
              plannerModels={settings.configuredProjectModels.filter((model) => model.cat === 'chat')}
              imageModels={settings.configuredProjectModels.filter((model) => model.cat === 'image')}
              videoModels={settings.configuredProjectModels.filter((model) => model.cat === 'video')}
            />
          </div>
        )}
      </ToastProvider>
    </TCtx.Provider>
  );
}
