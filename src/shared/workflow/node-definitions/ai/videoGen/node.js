/** @typedef {import('@/shared/workflow/types').NodeTypeDef} NodeTypeDef */
import {
  EMPTY_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_RATIO_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
} from '../../shared-options.js';

/** @type {NodeTypeDef} */
export const VIDEO_GEN_NODE = {
  type: 'videoGen',
  version: 1,
  label: '视频生成',
  icon: 'clapperboard',
  color: '#AF52DE',
  category: 'ai',
  inputs: [
    { id: 'prompt', label: '提示词', type: 'string', required: true },
    { id: 'reference', label: '参考图片', type: 'image', required: false },
    { id: 'video', label: '视频', type: 'video', required: false },
    { id: 'audio', label: '音频', type: 'audio', required: false },
    { id: 'apiKey', label: 'API Key', type: 'apiKey', required: false },
  ],
  outputs: [{ id: 'video', label: '生成视频', type: 'video' }],
  params: [
    { id: 'model', label: '模型', type: 'select', options: EMPTY_OPTIONS, default: '' },
    { id: 'duration', label: '时长（秒）', type: 'select', default: 5, options: VIDEO_DURATION_OPTIONS },
    { id: 'resolution', label: '分辨率', type: 'select', default: '720p', options: VIDEO_RESOLUTION_OPTIONS },
    { id: 'ratio', label: '比例', type: 'select', default: 'auto', options: VIDEO_RATIO_OPTIONS },
  ],
  architect: { enabled: true, order: 20, defaults: { model: '', duration: 5, resolution: '720p', ratio: 'auto' } },
  supportsDisabledPassthrough: true,
};
