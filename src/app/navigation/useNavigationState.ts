import { useEffect, useState } from 'react';
import type { Tab } from '@/shared/types';
import { loadJSON } from '@/shared/runtime';

const SHORTCUT_TABS: Tab[] = ['chat', 'image', 'video', 'workflow', 'settings'];

export function useNavigationState() {
  const [tab, setTab] = useState<Tab>(loadJSON('ai_tab', 'settings'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(loadJSON('ai_sidebar_collapsed', false));

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= '5') {
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
