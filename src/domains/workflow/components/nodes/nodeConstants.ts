import type { NodeExecStatus } from '@/domains/workflow/lib/store';
import type { ProviderConfig } from '@/shared/providers';
import { WORKFLOW_PORT_TYPE_COLORS, WORKFLOW_PORT_TYPE_LABELS } from '@/shared/workflow/port-visuals';
import {
  Bot,
  Clapperboard,
  Eraser,
  Eye,
  FileImage,
  Film,
  FolderDown,
  KeyRound,
  Merge,
  Music2,
  PenTool,
  Repeat,
  ScanLine,
  Search,
  Sparkles,
  SplitSquareVertical,
} from 'lucide-react';
import type { ComponentType } from 'react';

type NodeIconComponent = ComponentType<{ size?: number | string; strokeWidth?: number; className?: string }>;

export const NODE_ICONS: Record<string, NodeIconComponent> = {
  pen: PenTool,
  image: FileImage,
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

export const PORT_TYPE_COLORS = WORKFLOW_PORT_TYPE_COLORS;
export const PORT_TYPE_LABELS = WORKFLOW_PORT_TYPE_LABELS;

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
