/**
 * 系统级工作流通知。
 * Electron 环境在渲染进程创建 HTML5 Notification（自动桥接为原生通知，
 * onclick 在页面上下文处理，比主进程 Notification 的 click 事件更可靠）。
 * 浏览器环境通过 Service Worker 触发。
 */

let swRegistration: ServiceWorkerRegistration | null = null;

function ensureSW(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) return Promise.resolve(swRegistration);
  if (typeof navigator === 'undefined') return Promise.resolve(null);
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);

  return navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      swRegistration = reg;
      return reg;
    })
    .catch(() => null);
}

export function notifyWorkflowComplete(title: string, body: string) {
  if (typeof window === 'undefined') return;

  // Electron：渲染进程 HTML5 Notification，onclick 回调中 focus 窗口
  if (window.electronAPI) {
    const n = new Notification(title, { body });
    n.onclick = () => {
      window.electronAPI!.focusWindow();
    };
    return;
  }

  // 浏览器
  if (!('Notification' in window)) return;

  if (Notification.permission === 'denied') return;

  if (Notification.permission === 'default') {
    Notification.requestPermission();
    ensureSW();
    return;
  }

  // permission === 'granted'
  ensureSW().then((reg) => {
    if (reg) {
      reg.showNotification(title, { body, requireInteraction: true, silent: false });
    } else {
      try {
        new Notification(title, { body, requireInteraction: true });
      } catch {
        // 静默
      }
    }
  });
}
