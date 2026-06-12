import { loadJSON } from '@/shared/runtime';
import type { Tab } from '@/shared/types';
import { useEffect, useState } from 'react';

const SHORTCUT_TABS: Tab[] = ['chat', 'workflow', 'settings'];

function normalizeTab(value: unknown): Tab {
  if (value === 'chat' || value === 'workflow' || value === 'settings') return value;
  return 'chat';
}

export function useNavigationState() {
  const [tab, setTab] = useState<Tab>(() => normalizeTab(loadJSON('ai_tab', 'settings')));
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(loadJSON('ai_sidebar_collapsed', false));

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= String(SHORTCUT_TABS.length)) {
        event.preventDefault();
        setTab(SHORTCUT_TABS[Number(event.key) - 1]);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    setTab,
    tab,
  };
}
