import { useEffect, useRef, useState } from 'react';
import { SplashScreen } from '@/shared/ui/ios';
import { DesktopSidebar } from '@/app/navigation/Navigation';
import { ChatPanel } from '@/features/chat';
import { ImagePanel } from '@/features/image';
import { VideoPanel } from '@/features/video';
import WorkflowPage from '@/features/workflow/App';
import { ErrorBoundary } from '@/app/bootstrap/ErrorBoundary';
import { ToastProvider } from '@/contexts/ToastContext';
import { TCtx } from '@/contexts/ThemeContext';
import type { BridgeRef } from '@/lib/types';
import { getModelDisplayName, getModelGroupName } from '@/lib/model-routing';
import { useMemory } from '@/shared/hooks/useMemory';
import { useWorkflowStore } from '@/features/workflow/lib/store';
import { saveActiveRunSnapshot } from '@/features/workflow/lib/store/persistence';
import { useNavigationState } from './navigation/useNavigationState';
import { useThemeState } from './theme/useThemeState';
import { useAppBootstrap } from './bootstrap/useAppBootstrap';
import { FirstRunOnboarding, SettingsPanel, useStudioSettingsState } from '@/features/settings';
import '@/features/workflow/index.css';

function panelDisplayStyle(active: boolean) {
  return { flex: 1, overflow: 'hidden', display: active ? 'flex' : 'none' } as const;
}

export default function App() {
  const hydratedRef = useRef(false);
  const { tab, setTab, sidebarCollapsed, setSidebarCollapsed } = useNavigationState();
  const { colors, themeMode, setThemeMode } = useThemeState();
  const settings = useStudioSettingsState();
  const memory = useMemory();
  const bridgeRef = useRef<BridgeRef>({ addToImageGallery: () => {}, addToVideoGallery: () => {}, addToChatPending: () => {} });
  const workflowBusy = useWorkflowStore((state) => state.isExecuting);
  const [chatBusy, setChatBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => localStorage.getItem('suelr_onboarding_dismissed') === 'true');
  const projectBusy = workflowBusy || chatBusy || imageBusy || videoBusy;

  const { splashFading, splashHidden } = useAppBootstrap({
    hydratedRef,
    setSidebarCollapsed,
    setTab,
    setThemeMode,
    settings,
    sidebarCollapsed,
    tab,
    themeMode,
  });
  const hasUsableConfig = settings.apiConfigs.some((config) => (
    Boolean(config.base && config.apiKey) &&
    ((config.projectModels || []).some((model) => model.configured) || (config.models || []).length > 0)
  ));
  const showOnboarding = splashHidden && !hasUsableConfig && !onboardingDismissed;
  const chatPanelStyle = panelDisplayStyle(tab === 'chat');
  const imagePanelStyle = panelDisplayStyle(tab === 'image');
  const videoPanelStyle = panelDisplayStyle(tab === 'video');
  const workflowPanelStyle = panelDisplayStyle(tab === 'workflow');
  const settingsPanelStyle = panelDisplayStyle(tab === 'settings');

  useEffect(() => {
    const grouped = { all: [] as any[], chat: [] as any[], image: [] as any[], video: [] as any[] };
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

  const handleOpenWorkflowRun = async (payload: { runId: string; workflowId?: string; source?: 'persisted' | 'draft' }) => {
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
        {showOnboarding && (
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
        )}
        {!showOnboarding && <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', background: 'transparent', color: colors.text, minWidth: 1280 }}>
          <DesktopSidebar tab={tab} setTab={setTab} modelCount={settings.configuredProjectModels.length} themeMode={themeMode} setThemeMode={setThemeMode} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <div style={chatPanelStyle}><ErrorBoundary><ChatPanel base={settings.base} apiKey={settings.apiKey} apiConfigs={settings.apiConfigs} models={settings.configuredProjectModels} addLog={settings.addLog} bridgeRef={bridgeRef} roles={settings.roles} getMemoryContext={memory.getMemoryContext} refreshMemories={memory.refreshMemories} scheduleExtraction={memory.scheduleExtraction} tavilyApiKey={settings.tavilyApiKey} providerConfig={settings.providerConfig} chatStreamingMode={settings.chatStreamingMode} imageStreamingMode={settings.imageStreamingMode} videoStreamingMode={settings.videoStreamingMode} activeTab={tab} searchMemories={memory.searchMemories} onBusyChange={setChatBusy} onOpenWorkflowRun={handleOpenWorkflowRun} /></ErrorBoundary></div>
            <div style={imagePanelStyle}><ErrorBoundary><ImagePanel base={settings.base} apiKey={settings.apiKey} apiConfigs={settings.apiConfigs} models={settings.configuredProjectModels} addLog={settings.addLog} bridgeRef={bridgeRef} onAddToChat={(urls: string[]) => { bridgeRef.current.addToChatPending(urls); setTab('chat'); }} providerConfig={settings.providerConfig} imageStreamingMode={settings.imageStreamingMode} onBusyChange={setImageBusy} /></ErrorBoundary></div>
            <div style={videoPanelStyle}><ErrorBoundary><VideoPanel base={settings.base} apiKey={settings.apiKey} apiConfigs={settings.apiConfigs} models={settings.configuredProjectModels} addLog={settings.addLog} bridgeRef={bridgeRef} onAddToChat={(_prompt: string, videoUrl?: string) => { if (videoUrl) bridgeRef.current.addToChatPending([videoUrl]); setTab('chat'); }} providerConfig={settings.providerConfig} videoStreamingMode={settings.videoStreamingMode} onBusyChange={setVideoBusy} /></ErrorBoundary></div>
            <div style={workflowPanelStyle}><ErrorBoundary><WorkflowPage onOpenStudioSettings={() => setTab('settings')} /></ErrorBoundary></div>
            <div style={settingsPanelStyle}><ErrorBoundary><SettingsPanel apiConfigs={settings.apiConfigs} setApiConfigs={settings.setApiConfigs} activeConfigId={settings.activeConfigId} setActiveConfigId={settings.setActiveConfigId} applyConfig={settings.applyConfig} addNewConfig={settings.addNewConfig} deleteConfig={settings.deleteConfig} base={settings.base} apiKey={settings.apiKey} setBase={settings.setBase} setApiKey={settings.setApiKey} models={settings.models} setModels={settings.setModels} addLog={settings.addLog} logs={settings.logs} onClearLogs={settings.clearLogs} themeMode={themeMode} setThemeMode={setThemeMode} agentProfiles={settings.agentProfiles} customAgentProfiles={settings.customAgentProfiles} upsertAgentProfile={settings.upsertAgentProfile} deleteAgentProfile={settings.deleteAgentProfile} memories={memory.memories} onDeleteMemory={memory.deleteMemory} onClearMemories={memory.clearMemories} exportMemories={memory.exportMemories} tavilyApiKey={settings.tavilyApiKey} tavilyApiKeySet={settings.tavilyApiKeySet} setTavilyApiKey={settings.setTavilyApiKey} setTavilyApiKeySet={settings.setTavilyApiKeySet} outboundProxy={settings.outboundProxy} setOutboundProxy={settings.setOutboundProxy} projectBusy={projectBusy} /></ErrorBoundary></div>
          </div>
        </div>}
      </ToastProvider>
    </TCtx.Provider>
  );
}
