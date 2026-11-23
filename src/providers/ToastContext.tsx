import { StatusNotice } from '@/ui/FeedbackPrimitives';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

export interface ToastItem {
  id: string;
  msg: string;
  type: 'success' | 'error' | 'info';
  exiting?: boolean;
}

const TOAST_TITLES: Record<ToastItem['type'], string> = {
  success: '操作完成',
  error: '操作失败',
  info: '提示',
};

const ToastCtx = createContext<{ toast: (msg: string, type?: ToastItem['type']) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx).toast;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const nextId = useRef(0);
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((msg: string, type: ToastItem['type'] = 'info') => {
    const id = String(++nextId.current);
    setItems((p) => [...p, { id, msg, type }]);
    // Start exit animation after 2700ms, remove after 3000ms
    setTimeout(() => setItems((p) => p.map((t) => (t.id === id ? { ...t, exiting: true } : t))), 2700);
    setTimeout(() => setItems((p) => p.filter((t) => t.id !== id)), 3000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="ui-toast-stack">
        {items.map((item) => (
          <StatusNotice
            key={item.id}
            className="ui-toast"
            role={item.type === 'error' ? 'alert' : 'status'}
            data-exiting={item.exiting || undefined}
            tone={item.type}
          >
            <strong>{TOAST_TITLES[item.type]}</strong>
            <p>{item.msg}</p>
          </StatusNotice>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
