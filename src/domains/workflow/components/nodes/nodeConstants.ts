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
export const NODE_PORT_GUTTER = 20;
export const NODE_PORT_LABEL_INSET = 48;
