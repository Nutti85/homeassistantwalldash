import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Keep the dev proxy off the host's 127.0.0.1-only WSL forwards. Follow PORT
// for secondary worktrees, while allowing a target override when needed.
const backendPort = process.env.PORT?.trim() || '3000';
const apiProxyTarget = process.env.DASHBOARD_API_PROXY_TARGET?.trim() || `http://127.0.0.2:${backendPort}`;

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
