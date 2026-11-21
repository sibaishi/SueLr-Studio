import type { NodeExecStatus } from '@/domains/workflow/lib/store';
import type { ProviderConfig } from '@/shared/providers';
import { WORKFLOW_PORT_TYPE_COLORS, WORKFLOW_PORT_TYPE_LABELS } from '@/shared/workflow/port-visuals';

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
