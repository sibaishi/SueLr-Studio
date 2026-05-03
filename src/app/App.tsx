import { useEffect, useRef } from 'react';
import { SplashScreen } from '@/components/ios';
import { DesktopSidebar } from '@/components/Navigation';
import { ChatPanel } from '@/components/ChatPanel';
import { ImagePanel } from '@/components/ImagePanel';
import { VideoPanel } from '@/components/VideoPanel';
import WorkflowPage from '@/features/workflow/App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/contexts/ToastContext';
import { TCtx } from '@/contexts/ThemeContext';
import type { BridgeRef } from '@/lib/types';
import { useMemory } from '@/hooks/useMemory';
import { useWorkflowStore } from '@/features/workflow/lib/store';
import { useNavigationState } from './navigation/useNavigationState';
import { useThemeState } from './theme/useThemeState';
import { useAppBootstrap } from './bootstrap/useAppBootstrap';
import { SettingsPanel, useStudioSettingsState } from '@/domains/settings';
import '@/features/workflow/index.css';

export default function App() {
  const hydratedRef = useRef(false);
  const { tab, setTab, sidebarCollapsed, setSidebarCollapsed } = useNavigationState();
  const { colors, themeMode, setThemeMode } = useThemeState();
  const settings = useStudioSettingsState();
  const memory = useMemory();
  const bridgeRef = useRef<BridgeRef>({ addToImageGallery: () => {}, addToVideoGallery: () => {}, addToChatPending: () => {} });

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

  useEffect(() => {
    if (tab !== 'workflow') return;
    void useWorkflowStore.getState().fetchModels();
  }, [tab, settings.activeConfigId, settings.models.length]);

  return (
    <TCtx.Provider value={colors}>
      <ToastProvider>
        {!splashHidden && <SplashScreen fading={splashFading} />}
        <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif', background: 'transparent', color: colors.text, minWidth: 1280 }}>
          <DesktopSidebar tab={tab} setTab={setTab} modelCount={settings.configuredProjectModels.length} themeMode={themeMode} setThemeMode={setThemeMode} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflow: 'hidden', display: tab === 'chat' ? 'flex' : 'none' }}><ErrorBoundary><ChatPanel base={settings.base} apiKey={settings.apiKey} models={settings.configuredProjectModels} addLog={settings.addLog} bridgeRef={bridgeRef} roles={settings.roles} getMemoryContext={memory.getMemoryContext} scheduleExtraction={memory.scheduleExtraction} tavilyApiKey={settings.tavilyApiKey} providerConfig={settings.providerConfig} chatStreamingMode={settings.chatStreamingMode} imageStreamingMode={settings.imageStreamingMode} videoStreamingMode={settings.videoStreamingMode} activeTab={tab} searchMemories={memory.searchMemories} /></ErrorBoundary></div>
            <div style={{ flex: 1, overflow: 'hidden', display: tab === 'image' ? 'flex' : 'none' }}><ErrorBoundary><ImagePanel base={settings.base} apiKey={settings.apiKey} models={settings.configuredProjectModels} addLog={settings.addLog} bridgeRef={bridgeRef} onAddToChat={(urls: string[]) => { bridgeRef.current.addToChatPending(urls); setTab('chat'); }} providerConfig={settings.providerConfig} imageStreamingMode={settings.imageStreamingMode} /></ErrorBoundary></div>
            <div style={{ flex: 1, overflow: 'hidden', display: tab === 'video' ? 'flex' : 'none' }}><ErrorBoundary><VideoPanel base={settings.base} apiKey={settings.apiKey} models={settings.configuredProjectModels} addLog={settings.addLog} bridgeRef={bridgeRef} onAddToChat={(_prompt: string, videoUrl?: string) => { if (videoUrl) bridgeRef.current.addToChatPending([videoUrl]); setTab('chat'); }} providerConfig={settings.providerConfig} videoStreamingMode={settings.videoStreamingMode} /></ErrorBoundary></div>
            <div style={{ flex: 1, overflow: 'hidden', display: tab === 'workflow' ? 'flex' : 'none' }}><ErrorBoundary><WorkflowPage onOpenStudioSettings={() => setTab('settings')} /></ErrorBoundary></div>
            <div style={{ flex: 1, overflow: 'hidden', display: tab === 'settings' ? 'flex' : 'none' }}><ErrorBoundary><SettingsPanel apiConfigs={settings.apiConfigs} setApiConfigs={settings.setApiConfigs} activeConfigId={settings.activeConfigId} setActiveConfigId={settings.setActiveConfigId} applyConfig={settings.applyConfig} addNewConfig={settings.addNewConfig} deleteConfig={settings.deleteConfig} base={settings.base} apiKey={settings.apiKey} setBase={settings.setBase} setApiKey={settings.setApiKey} models={settings.models} setModels={settings.setModels} addLog={settings.addLog} logs={settings.logs} onClearLogs={settings.clearLogs} themeMode={themeMode} setThemeMode={setThemeMode} roles={settings.roles} customRoles={settings.customRoles} setCustomRoles={settings.setCustomRoles} memories={memory.memories} onDeleteMemory={memory.deleteMemory} onClearMemories={memory.clearMemories} exportMemories={memory.exportMemories} tavilyApiKey={settings.tavilyApiKey} tavilyApiKeySet={settings.tavilyApiKeySet} setTavilyApiKey={settings.setTavilyApiKey} setTavilyApiKeySet={settings.setTavilyApiKeySet} /></ErrorBoundary></div>
          </div>
        </div>
      </ToastProvider>
    </TCtx.Provider>
  );
}
