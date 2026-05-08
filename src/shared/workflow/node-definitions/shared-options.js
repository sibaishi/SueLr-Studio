/** @typedef {import('@/shared/workflow/types').ParamDef} ParamDef */

export const RATIO_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
];

export const VIDEO_DURATION_OPTIONS = [
  { label: '5秒', value: 5 },
  { label: '10秒', value: 10 },
];

export const VIDEO_RESOLUTION_OPTIONS = [
  { label: '480p', value: '480p' },
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
];

export const VIDEO_RATIO_OPTIONS = [
  { label: '自动', value: 'auto' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

/** @type {ParamDef['options']} */
export const EMPTY_OPTIONS = [];
