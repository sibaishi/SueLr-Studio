import { GENERATION_PARAMETER_KEYS, type GenerationRecord } from '@/shared/types/generation';

/** 参数复用只修改允许的参数；不带入提示词、附件或运行时字段。 */
export function generationParameterPatch(record: GenerationRecord): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['model', ...GENERATION_PARAMETER_KEYS]) {
    const value = record.parameters[key];
    patch[key] =
      typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
        ? value
        : undefined;
  }
  // 清除旧版别名，避免历史选项覆盖本次参数。
  patch.resolution = undefined;
  return patch;
}

export const GENERATION_PARAMETER_LABELS: Record<string, string> = {
  model: '模型',
  mode: '生成类型',
  ratio: '画面比例',
  width: '宽度',
  height: '高度',
  quality: '质量',
  imageResolution: '分辨率',
  n: '生成数量',
  output_format: '输出格式',
  duration: '时长（秒）',
  voice: '音色',
  systemPrompt: '系统提示词',
  enableWebSearch: '联网搜索',
  mjVersion: '版本',
  mjAr: '画面比例',
  mjSeed: '随机种子',
  mjStylize: '风格强度',
  mjChaos: '变化程度',
  mjNo: '排除内容',
  mjMode: '生成速度',
};
export function generationParameterText(key: string, value: string | number | boolean) {
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  if (key === 'mode')
    return (
      (
        { chat: '文本', image: '图像', video: '视频', audio: '语音', midjourney: 'Midjourney' } as Record<
          string,
          string
        >
      )[String(value)] || String(value)
    );
  return value === 'auto' ? '自动' : String(value);
}
