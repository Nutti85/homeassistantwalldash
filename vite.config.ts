import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep the dev proxy off the host's 127.0.0.1-only WSL forwards. The backend
// listens on all interfaces, so the adjacent loopback address reaches this
// project even when another local app owns 127.0.0.1:3000.
const apiProxyTarget = process.env.DASHBOARD_API_PROXY_TARGET?.trim() || 'http://127.0.0.2:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': apiProxyTarget,
    },
  },
});
