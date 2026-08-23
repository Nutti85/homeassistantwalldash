# Project operations

## Local development and reloads

- Run `npm.cmd run dev` from the repository root for local development. It starts an API-only backend on port `3000` and Vite on port `5173`.
- The development launcher supervises the backend. If the backend exits after a successful start, it is restarted with bounded backoff while Vite stays available. Five consecutive startup failures stop the full stack so configuration and port errors remain visible.
- Local backend/frontend output and lifecycle events are written to `.local-dev.log` (ignored by Git and trimmed automatically). Inspect the end of this file before restarting when a local failure is reported.
- `http://127.0.0.1:5173` is the sole local dashboard URL. Use it to preview uncommitted changes with hot reload.
- Port `3000` is an internal API endpoint for Vite during development; it must not serve a dashboard page in dev mode.
- `npm.cmd run start` serves the built dashboard locally for a production-build check, but it is not part of normal development.
- Keep ports fixed: API = `3000`, Vite = `5173`. Vite uses `strictPort` so a port conflict fails visibly instead of silently selecting another port.
- Before restarting local development, confirm the process command line and working directory. Do not stop or repurpose another project's listener.
- The dashboard message `Kunne ikke oppdatere smarthuset. Prøv igjen.` means repeated `/api/states` requests failed; it does not by itself prove the Node backend exited. Diagnose in this order: check `http://127.0.0.1:3000/health`, check `http://127.0.0.1:5173/api/states`, then inspect `.local-dev.log` and the verified listener command lines.
- The client retries failed state polls after 1, 2, 4, then at most 5 seconds. It shows a connection-specific warning after three failed initial requests, but preserves confirmed state and tolerates up to twelve consecutive background failures before warning. Visibility, focus, and browser-online events trigger immediate recovery checks.
- Production is the Portainer deployment at `http://192.168.1.50:3100`. Local file saves never reload or update it; update production only through an explicitly requested Portainer stack deployment.

- Use the connected Portainer MCP for stack, container, and deployment operations in this project.
- Do not assume the local Docker daemon controls the deployed dashboard.
- Re-discover the Portainer environment and stack IDs before mutating them; target the stack named `homeassistant-wall-dashboard`.
- Preserve existing Portainer environment variables, especially Home Assistant credentials, during stack updates.
