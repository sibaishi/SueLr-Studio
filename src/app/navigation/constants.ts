import type { Tab } from '@/shared/types';

export const NAV_ITEMS: {
  key: Tab;
  icon: string;
  label: string;
  colorKey: 'green' | 'blue' | 'neutral';
}[] = [
  { key: 'chat', icon: 'message', label: '对话', colorKey: 'green' },
  { key: 'workflow', icon: 'workflow', label: '工作流', colorKey: 'blue' },
  { key: 'settings', icon: 'settings', label: '设置', colorKey: 'neutral' },
];
