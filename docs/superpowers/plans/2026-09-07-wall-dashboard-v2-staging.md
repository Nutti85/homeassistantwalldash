# Wall Dashboard V2 Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution in this session; the user explicitly requested implementation and deployment now.

**Goal:** Release the selected dashboard direction as a GitHub-backed, side-by-side Portainer V2 stack.

**Architecture:** Compile the selected V2 dashboard by setting a Vite build-time version flag in a dedicated Compose file. The V2 service uses unique Docker names and a unique persistent source volume, but preserves the established git-sync command so every start rebuilds from its pinned remote branch.

**Tech Stack:** React 18, TypeScript, Vite, Node/Express, Docker Compose, Portainer.

**Spec:** `docs/specs/2026-09-07-wall-dashboard-v2-staging.md`

## Global Constraints

- Do not mutate V1's `homeassistant-wall-dashboard` stack, container, port `3100`, volume, or environment.
- Keep Home Assistant credentials in Portainer environment variables only.
- V2 must use the existing host at `192.168.1.50` with a distinct host port; do not promise a fixed Docker bridge IP.
- Preserve the existing git-sync reset-and-build behavior on every V2 container start.

---

### Task 1: Make the selected dashboard a build-time V2 default

**Files:**

- Modify: `src/client/App.tsx`

**Interfaces:**

- Consumes: `import.meta.env.VITE_DASHBOARD_VERSION`.
- Produces: the V2 main dashboard at `/` when the value is `v2`.

- [ ] Add build-version route selection, keep query scenarios opt-in, then run `npm.cmd run build`.

### Task 2: Declare an isolated V2 Portainer stack

**Files:**

- Create: `docker-compose.portainer.v2.yml`

**Interfaces:**

- Consumes: the existing Portainer environment variables from V1 plus `DASHBOARD_PORT`, `GIT_SYNC_REPO`, and `GIT_SYNC_BRANCH`.
- Produces: `homeassistant-wall-dashboard-v2`, container `homeassistant-wall-dashboard-v2`, and volume `wall_dashboard_v2_code`.

- [ ] Copy the existing git-sync command, use V2-only Docker names, map `${DASHBOARD_PORT:-3200}:3000`, and set `VITE_DASHBOARD_VERSION=v2` for the build.

### Task 3: Release and deploy without changing V1

**Files:**

- Modify: Git branch and GitHub remote state.
- Create: Portainer local stack `homeassistant-wall-dashboard-v2`.

- [ ] Run `npm.cmd test` and `npm.cmd run build`.
- [ ] Commit and push `codex/dashboard-prototype-v2`.
- [ ] Create the V2 stack in Portainer environment `3` by copying V1's runtime variables, setting `DASHBOARD_PORT=3200` and `GIT_SYNC_BRANCH=codex/dashboard-prototype-v2`.
- [ ] Verify health, browser root, and the container network details.
