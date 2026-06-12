import type { RuntimeCapabilities, RuntimeMode } from '@/shared/runtime';

const RUNTIME_MODE_LABELS: Record<RuntimeMode, string> = {
  desktop: '桌面端',
  'local-web': '本地 Web',
};

export function formatRuntimeModeLabel(mode?: RuntimeMode | null) {
  if (!mode) return '未知';
  return RUNTIME_MODE_LABELS[mode] || mode;
}

export function getRuntimeActionHint(
  runtime: RuntimeCapabilities | null,
  capability: 'canSelectDirectory' | 'canRestartBackend',
) {
  if (!runtime) {
    return '运行时能力尚未加载，请稍后重试。';
  }

  if (runtime[capability]) {
    return '';
  }

  if (capability === 'canSelectDirectory') {
    return '当前运行模式不支持目录选择器。';
  }

  return '当前运行模式不支持从设置页重启后端。';
}
