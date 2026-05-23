import {
  Bot,
  Clapperboard,
  Eraser,
  Eye,
  FileImage,
  Film,
  FolderDown,
  Scan,
  KeyRound,
  Merge,
  Music2,
  PenTool,
  Sparkles,
  Repeat,
  ScanLine,
  Search,
  SplitSquareVertical,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { ProviderConfig } from '@/shared/providers';
import type { NodeExecStatus } from '@/domains/workflow/lib/store';

type NodeIconComponent = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;

export const NODE_ICONS: Record<string, NodeIconComponent> = {
  pen: PenTool,
  image: FileImage,
  mask: Scan,
  resize: ScanLine,
  film: Film,
  music: Music2,
  key: KeyRound,
  repeat: Repeat,
  eraser: Eraser,
  merge: Merge,
  split: SplitSquareVertical,
  bot: Bot,
  palette: FileImage,
  clapperboard: Clapperboard,
  search: Search,
  eye: Eye,
  promptHelper: Sparkles,
  save: FolderDown,
};

export const PORT_TYPE_COLORS: Record<string, string> = {
  string: '#007AFF',
  'string[]': '#007AFF',
  image: '#FF9500',
  'image[]': '#FF9500',
  mask: '#7C4DFF',
  video: '#AF52DE',
  'video[]': '#AF52DE',
  audio: '#FF375F',
  'audio[]': '#FF375F',
  apiKey: '#5856D6',
  any: '#8E8E93',
  'any[]': '#8E8E93',
};

export const PORT_TYPE_LABELS: Record<string, string> = {
  string: 'TEXT',
  'string[]': 'TEXT[]',
  image: 'IMG',
  'image[]': 'IMG[]',
  mask: 'MASK',
  video: 'VID',
  'video[]': 'VID[]',
  audio: 'AUD',
  'audio[]': 'AUD[]',
  apiKey: 'KEY',
  any: 'ANY',
  'any[]': 'ANY[]',
};

export const NODE_API_PROVIDER_CONFIG: Partial<ProviderConfig> = {
  authType: 'bearer',
  modelsEndpoint: '/models',
  chatEndpoint: '/chat/completions',
  imageEndpoint: '/images/generations',
  videoEndpoint: '/video/generations',
};

export const NODE_INNER_GUTTER = 10;
export const NODE_PORT_GUTTER = 18;
export const NODE_PORT_LABEL_INSET = 48;

export const STATUS_BADGE: Record<NodeExecStatus, { color: string; label: string }> = {
  idle: { color: '', label: '' },
  running: { color: '#FF9500', label: 'running' },
  success: { color: '#30D158', label: 'success' },
  error: { color: '#FF3B30', label: 'error' },
};
