import path from "path";
import { fileURLToPath } from "url";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3001';
const enableSingleFile = process.env.VITE_SINGLEFILE === '1';

function manualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined;

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
    return 'vendor-react';
  }
  if (id.includes('@xyflow/react')) {
    return 'vendor-react-flow';
  }
  if (id.includes('/three/examples/') || id.includes('/three/addons/')) {
    return 'vendor-three-addons';
  }
  if (id.includes('/three/build/')) {
    return 'vendor-three';
  }
  if (
    id.includes('react-markdown') ||
    id.includes('/remark-') ||
    id.includes('/rehype-') ||
    id.includes('/micromark') ||
    id.includes('/mdast') ||
    id.includes('/hast') ||
    id.includes('/unified')
  ) {
    return 'vendor-markdown';
  }
  if (id.includes('/lucide-react/')) {
    return 'vendor-icons';
  }

  return undefined;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(enableSingleFile ? [viteSingleFile()] : [])],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
      output: enableSingleFile ? undefined : { manualChunks },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
