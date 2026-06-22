export const WORKFLOW_PORT_TYPE_COLORS: Readonly<Record<string, string>> = {
  string: '#007AFF',
  'string[]': '#007AFF',
  image: '#FF9500',
  'image[]': '#FF9500',
  video: '#AF52DE',
  'video[]': '#AF52DE',
  audio: '#FF375F',
  'audio[]': '#FF375F',
  apiKey: '#5856D6',
  any: '#64D2FF',
  'any[]': '#64D2FF',
};

export const WORKFLOW_PORT_TYPE_LABELS: Readonly<Record<string, string>> = {
  string: 'TEXT',
  'string[]': 'TEXT[]',
  image: 'IMG',
  'image[]': 'IMG[]',
  video: 'VID',
  'video[]': 'VID[]',
  audio: 'AUD',
  'audio[]': 'AUD[]',
  apiKey: 'KEY',
  any: 'ANY',
  'any[]': 'ANY[]',
};

export const DEFAULT_WORKFLOW_EDGE_STYLE = {
  stroke: 'var(--color-text-tertiary)',
  strokeWidth: 2,
} as const;
