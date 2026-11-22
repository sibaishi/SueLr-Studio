import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
const Entry =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('view') === 'canvas-components'
    ? lazy(() => import('@/domains/workflow/components/CanvasComponentGallery'))
    : lazy(() => import('@/app/App'));

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
