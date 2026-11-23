import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
const view = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('view') : null;
const Entry = lazy(() => {
  if (view === 'canvas-components') return import('@/domains/workflow/components/CanvasComponentGallery');
  if (view === 'studio-components') return import('@/ui/StudioComponentGallery');
  return import('@/app/App');
});

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <Suspense fallback={<p role="status">正在加载…</p>}>
      <Entry />
    </Suspense>
  </StrictMode>,
);
