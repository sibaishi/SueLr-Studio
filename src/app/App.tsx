import { LoginGate } from '@/app/auth/LoginGate';
import { ErrorBoundary } from '@/app/bootstrap/ErrorBoundary';
import { DesktopSidebar } from '@/app/navigation/Navigation';
import type { ModelOption } from '@/domains/workflow/lib/projectModels';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { saveActiveRunSnapshot } from '@/domains/workflow/lib/store/persistence';
import { useStudioSettingsState } from '@/features/settings';
import { TCtx } from '@/providers/ThemeContext';
import { ToastProvider } from '@/providers/ToastContext';
import { logout } from '@/shared/api/auth';
import { subscribeAuthInvalidated } from '@/shared/api/client';
import { useMemory } from '@/shared/hooks/useMemory';
import { getModelDisplayName, getModelGroupName } from '@/shared/providers/model-routing';
import type { BridgeRef, Tab } from '@/shared/types';
import { SplashScreen } from '@/shared/ui/ios';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useAppBootstrap } from './bootstrap/useAppBootstrap';
import { useNavigationState } from './navigation/useNavigationState';
import { useThemeState } from './theme/useThemeState';
import '@/domains/workflow/index.css';

const ChatPanel = lazy(() => import('@/domains/chat').then((module) => ({ default: module.ChatPanel })));
const ImagePanel = lazy(() => import('@/domains/image').then((module) => ({ default: module.ImagePanel })));
const VideoPanel = lazy(() => import('@/domains/video').then((module) => ({ default: module.VideoPanel })));
const WorkflowPage = lazy(() => import('@/domains/workflow/App'));
const SettingsPanel = lazy(() =>
  import('@/features/settings/components/SettingsPanel').then((module) => ({ default: module.SettingsPanel })),
);
const FirstRunOnboarding = lazy(() =>
  import('@/features/settings/components/FirstRunOnboarding').then((module) => ({
    default: module.FirstRunOnboarding,
  })),
);

function panelDisplayStyle(active: boolean) {
  return { flex: 1, overflow: 'hidden', display: active ? 'flex' : 'none' } as const;
}

function WorkspaceLoading() {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'rgba(255, 255, 255, 0.68)' }}>加载中...</div>
  );
}

export default function App() {
  const hydratedRef = useRef(false);
  const { tab, setTab, sidebarCollapsed, setSidebarCollapsed } = useNavigationState();
  const { colors, themeMode, setThemeMode } = useThemeState();
  const settings = useStudioSettingsState();
  const memory = useMemory();
  const bridgeRef = useRef<BridgeRef>({
    addToImageGallery: () => {},
    addToVideoGallery: () => {},
    addToChatPending: () => {},
  });
  const workflowBusy = useWorkflowStore((state) => state.isExecuting);
  const [chatBusy, setChatBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(
    () => localStorage.getItem('suelr_onboarding_dismissed') === 'true',
  );
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<Tab>>(() => new Set([tab]));
  const projectBusy = workflowBusy || chatBusy || imageBusy || videoBusy;

  const { refreshRuntimeCapabilities, runtimeCapabilities, splashFading, splashHidden } = useAppBootstrap({
    hydratedRef,
    setSidebarCollapsed,
    setTab,
    setThemeMode,
    settings,
    sidebarCollapsed,
    tab,
    themeMode,
  });
  const hasUsableConfig = settings.apiConfigs.some(
    (config) =>
      Boolean(config.base && (config.apiKey || config.apiKeySet)) &&
      (config.projectModels || []).some((model) => model.configured),
  );
  const showOnboarding = splashHidden && !hasUsableConfig && !onboardingDismissed;
  const showLoginGate = Boolean(splashHidden && runtimeCapabilities?.auth.required && !runtimeCapabilities.auth.user);
  const chatPanelStyle = panelDisplayStyle(tab === 'chat');
  const imagePanelStyle = panelDisplayStyle(tab === 'image');
  const videoPanelStyle = panelDisplayStyle(tab === 'video');
  const workflowPanelStyle = panelDisplayStyle(tab === 'workflow');
  const settingsPanelStyle = panelDisplayStyle(tab === 'settings');

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  useEffect(() => {
    if (!runtimeCapabilities?.auth.required) return undefined;
    return subscribeAuthInvalidated(() => {
      void refreshRuntimeCapabilities();
    });
  }, [refreshRuntimeCapabilities, runtimeCapabilities?.auth.required]);

  useEffect(() => {
    if (!runtimeCapabilities?.auth.required || !runtimeCapabilities.auth.user) return undefined;
    const timer = window.setInterval(() => {
      void refreshRuntimeCapabilities();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshRuntimeCapabilities, runtimeCapabilities?.auth.required, runtimeCapabilities?.auth.user]);

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    await refreshRuntimeCapabilities();
    setTab('workflow');
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

  const handleOpenWorkflowRun = async (payload: {
    runId: string;
    workflowId?: string;
    source?: 'persisted' | 'draft';
  }) => {
    if (!payload.runId) return;

    const workflowStore = useWorkflowStore.getState();
    if (payload.workflowId && payload.workflowId !== workflowStore.workflowId) {
      await workflowStore.loadWorkflow(payload.workflowId);
    }

    saveActiveRunSnapshot({
      runId: payload.runId,
      workflowId: payload.workflowId || useWorkflowStore.getState().workflowId,
      source: payload.source,
    });

    useWorkflowStore.setState({
      currentRunId: payload.runId,
      isExecuting: true,
      executionMessage: '已连接到聊天触发的工作流运行...',
      lastExecutionStatus: null,
      lastExecutionError: null,
    });

    useWorkflowStore.getState().addExecutionLog({
      level: 'info',
      message: '已从聊天页面跳转到工作流运行现场',
      details: payload,
    });

    setTab('workflow');
    void useWorkflowStore.getState().syncExecutionRunStatus();
  };

  return (
    <TCtx.Provider value={colors}>
      <ToastProvider>
        {!splashHidden && <SplashScreen fading={splashFading} />}
        {showLoginGate && runtimeCapabilities && (
          <LoginGate runtime={runtimeCapabilities} onAuthenticated={refreshRuntimeCapabilities} />
        )}
        {!showLoginGate && showOnboarding && (
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
                setTab('workflow');
              }}
              setApiConfigs={settings.setApiConfigs}
              setApiKey={settings.setApiKey}
              setBase={settings.setBase}
              setModels={settings.setModels}
            />
          </Suspense>
        )}
        {!showLoginGate && !showOnboarding && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              height: '100vh',
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
              background: 'transparent',
              color: colors.text,
              minWidth: 1280,
            }}
          >
            <DesktopSidebar
              tab={tab}
              setTab={setTab}
              modelCount={settings.configuredProjectModels.length}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
              <div style={chatPanelStyle}>
                {visitedTabs.has('chat') && (
                  <ErrorBoundary>
                    <Suspense fallback={<WorkspaceLoading />}>
                      <ChatPanel
                        base={settings.base}
                        apiKey={settings.apiKey}
                        apiConfigs={settings.apiConfigs}
                        models={settings.configuredProjectModels}
                        addLog={settings.addLog}
                        bridgeRef={bridgeRef}
                        roles={settings.roles}
                        getMemoryContext={memory.getMemoryContext}
                        refreshMemories={memory.refreshMemories}
                        scheduleExtraction={memory.scheduleExtraction}
                        providerConfig={settings.providerConfig}
                        chatStreamingMode={settings.chatStreamingMode}
                        imageStreamingMode={settings.imageStreamingMode}
                        videoStreamingMode={settings.videoStreamingMode}
                        activeTab={tab}
                        searchMemories={memory.searchMemories}
                        onBusyChange={setChatBusy}
                        onOpenWorkflowRun={handleOpenWorkflowRun}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>
              <div style={imagePanelStyle}>
                {visitedTabs.has('image') && (
                  <ErrorBoundary>
                    <Suspense fallback={<WorkspaceLoading />}>
                      <ImagePanel
                        base={settings.base}
                        apiKey={settings.apiKey}
                        apiConfigs={settings.apiConfigs}
                        models={settings.configuredProjectModels}
                        addLog={settings.addLog}
                        bridgeRef={bridgeRef}
                        onAddToChat={(urls: string[]) => {
                          bridgeRef.current.addToChatPending(urls);
                          setTab('chat');
                        }}
                        providerConfig={settings.providerConfig}
                        imageStreamingMode={settings.imageStreamingMode}
                        onBusyChange={setImageBusy}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>
              <div style={videoPanelStyle}>
                {visitedTabs.has('video') && (
                  <ErrorBoundary>
                    <Suspense fallback={<WorkspaceLoading />}>
                      <VideoPanel
                        base={settings.base}
                        apiKey={settings.apiKey}
                        apiConfigs={settings.apiConfigs}
                        models={settings.configuredProjectModels}
                        addLog={settings.addLog}
                        bridgeRef={bridgeRef}
                        onAddToChat={(_prompt: string, videoUrl?: string) => {
                          if (videoUrl) bridgeRef.current.addToChatPending([videoUrl]);
                          setTab('chat');
                        }}
                        providerConfig={settings.providerConfig}
                        videoStreamingMode={settings.videoStreamingMode}
                        onBusyChange={setVideoBusy}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>
              <div style={workflowPanelStyle}>
                {visitedTabs.has('workflow') && (
                  <ErrorBoundary>
                    <Suspense fallback={<WorkspaceLoading />}>
                      <WorkflowPage onOpenStudioSettings={() => setTab('settings')} />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>
              <div style={settingsPanelStyle}>
                {visitedTabs.has('settings') && (
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
                        authUser={runtimeCapabilities?.auth.user || null}
                        onLogout={runtimeCapabilities?.auth.required ? handleLogout : undefined}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>
            </div>
          </div>
        )}
      </ToastProvider>
    </TCtx.Provider>
  );
}
