import { useEffect, useState } from 'react';
import type { Tab } from '@/lib/types';
import { loadJSON } from '@/lib/utils';

export function useNavigationState() {
  const [tab, setTab] = useState<Tab>(loadJSON('ai_tab', 'settings'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(loadJSON('ai_sidebar_collapsed', false));

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= '5') {
        event.preventDefault();
        const tabs: Tab[] = ['chat', 'image', 'video', 'workflow', 'settings'];
        setTab(tabs[Number(event.key) - 1]);
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
