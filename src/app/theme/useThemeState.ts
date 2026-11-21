import { loadJSON } from '@/shared/runtime';
import type { ThemeMode } from '@/shared/types';
import { useEffect, useState } from 'react';
import darkIcon from '../../../build/icon.svg?inline';
import lightIcon from '../../../build/icon-light.svg?inline';
import { DARK, LIGHT } from './constants';

export function useThemeState() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadJSON('ai_theme', 'dark'));
  const [systemDark, setSystemDark] = useState(window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const theme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector<HTMLLinkElement>('#app-icon')?.setAttribute('href', theme === 'light' ? lightIcon : darkIcon);
    window.electronAPI?.setIconTheme?.(theme);
  }, [theme]);

  const colors = theme === 'dark' ? DARK : LIGHT;

  return {
    colors,
    systemDark,
    themeMode,
    setThemeMode,
  };
}
