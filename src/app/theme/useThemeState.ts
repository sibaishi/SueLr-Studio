import { loadJSON } from '@/shared/runtime';
import type { ThemeMode } from '@/shared/types';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const theme = themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;
    document.documentElement.setAttribute('data-theme', theme);
  }, [themeMode, systemDark]);

  const colors = themeMode === 'system' ? (systemDark ? DARK : LIGHT) : themeMode === 'dark' ? DARK : LIGHT;

  return {
    colors,
    systemDark,
    themeMode,
    setThemeMode,
  };
}
