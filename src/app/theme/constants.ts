import type { Colors, ThemeMode } from '@/shared/types';

export const DARK: Colors = {
  bg: '#000000',
  card: 'rgba(255,255,255,0.06)',
  card2: 'rgba(255,255,255,0.10)',
  menuBg: '#1c1c1e',
  border: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.95)',
  text2: 'rgba(255,255,255,0.50)',
  text3: 'rgba(255,255,255,0.28)',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  neutral: '#D1D5DB',
};

export const LIGHT: Colors = {
  bg: '#F5F5F7',
  card: 'rgba(255,255,255,0.65)',
  card2: 'rgba(255,255,255,0.80)',
  menuBg: '#ffffff',
  border: 'rgba(0,0,0,0.06)',
  text: 'rgba(0,0,0,0.88)',
  text2: 'rgba(0,0,0,0.50)',
  text3: 'rgba(0,0,0,0.28)',
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  purple: '#AF52DE',
  neutral: '#5F6368',
};

export const THEME_LABELS: Record<ThemeMode, string> = {
  dark: '深色',
  light: '浅色',
  system: '系统',
};

export const THEME_ICONS: Record<ThemeMode, string> = {
  dark: 'moon',
  light: 'sun',
  system: 'monitor',
};
