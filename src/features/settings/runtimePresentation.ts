import type { RuntimeCapabilities, RuntimeMode } from '@/shared/runtime';

const RUNTIME_MODE_LABELS: Record<RuntimeMode, string> = {
  desktop: '桌面端',
  'local-web': '本地 Web',
  'server-single-user': '服务器单用户',
  'server-multi-user': '服务器多用户',
};

export function formatRuntimeModeLabel(mode?: RuntimeMode | null) {
  if (!mode) return '未知';
  return RUNTIME_MODE_LABELS[mode] || mode;
}

export function getRuntimeActionHint(runtime: RuntimeCapabilities | null, capability: 'canSelectDirectory' | 'canRestartBackend') {
  if (!runtime) {
    return '运行时能力未加载，稍后重试。';
  }

  if (runtime[capability]) {
    return '';
  }

  if (capability === 'canSelectDirectory') {
    return runtime.mode.startsWith('server')
      ? '服务器模式不支持弹出本地目录选择器，请直接填写服务器上的绝对路径。'
      : '当前运行模式不支持目录选择器。';
  }

  return runtime.mode.startsWith('server')
    ? '服务器模式不允许从设置页触发后端重启，请使用部署端的进程管理方式。'
    : '当前运行模式不支持从设置页重启后端。';
}
