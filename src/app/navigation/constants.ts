import type { Tab } from '@/shared/types';

export const NAV_ITEMS: {
  key: Tab;
  icon: string;
  label: string;
  colorKey: 'green' | 'orange' | 'purple' | 'blue' | 'text2' | 'neutral';
}[] = [
  { key: 'chat', icon: 'message', label: '对话', colorKey: 'green' },
  { key: 'image', icon: 'palette', label: '图像', colorKey: 'orange' },
  { key: 'video', icon: 'clapperboard', label: '视频', colorKey: 'purple' },
  { key: 'workflow', icon: 'workflow', label: '工作流', colorKey: 'blue' },
  { key: 'settings', icon: 'settings', label: '设置', colorKey: 'neutral' },
];
