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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), ...(enableSingleFile ? [viteSingleFile()] : [])],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
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
