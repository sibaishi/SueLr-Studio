import { useState, useCallback, createContext, useContext } from 'react';

export interface ToastItem { id: string; msg: string; type: 'success' | 'error' | 'info'; exiting?: boolean; }

const TOAST_TITLES: Record<ToastItem['type'], string> = {
  success: '操作完成',
  error: '操作失败',
  info: '提示',
};

const ToastCtx = createContext<{ toast: (msg: string, type?: ToastItem['type']) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx).toast;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((msg: string, type: ToastItem['type'] = 'info') => {
    const id = Date.now().toString(36);
    setItems(p => [...p, { id, msg, type }]);
    // Start exit animation after 2700ms, remove after 3000ms
    setTimeout(() => setItems(p => p.map(t => t.id === id ? { ...t, exiting: true } : t)), 2700);
    setTimeout(() => setItems(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  const colors: Record<ToastItem['type'], string> = { success: '#34C759', error: '#FF3B30', info: '#007AFF' };

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div style={{ position: 'fixed', top: 'max(env(safe-area-inset-top, 16px), 16px)', right: 16, zIndex: 100000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {items.map(t => (
          <div key={t.id} role="alert" aria-live="assertive" style={{
            padding: '10px 18px', borderRadius: 12, background: colors[t.type], color: '#fff',
            fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            animation: t.exiting ? 'toastOut 0.3s ease forwards' : 'toastIn 0.3s ease',
            pointerEvents: 'auto', maxWidth: 340,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.2, opacity: 0.9 }}>{TOAST_TITLES[t.type]}</div>
            <div style={{ marginTop: 2, lineHeight: 1.5 }}>{t.msg}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
