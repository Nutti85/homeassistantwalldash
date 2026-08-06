# Home Assistant Wall Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Norwegian, responsive, Stitch-locked Home Assistant control dashboard that runs as one secure Portainer Docker service.

**Architecture:** A Vite React client renders the single tablet dashboard and calls same-origin Express endpoints. Express owns an allowlisted Home Assistant REST client, executes a requested command, then reads and returns confirmed entity states; credentials remain in `HA_URL` and `HA_TOKEN` server environment variables. A multi-stage Docker image serves the built SPA and API from one process.

**Tech Stack:** TypeScript, React 18, Vite, Express 5, Vitest, React Testing Library, Supertest, Docker Compose.

---

## File structure

- `package.json` — scripts and runtime/test dependencies.
- `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html` — TypeScript, Vite, and test setup.
- `src/shared/entities.ts` — allowlisted entity constants and API payload types shared by server/client.
- `src/server/homeAssistant.ts` — Home Assistant REST client and command-then-confirm logic.
- `src/server/app.ts` — Express routes, safe request validation, static SPA serving, health endpoint.
- `src/server/index.ts` — production server entrypoint with environment validation.
- `src/client/api.ts` — typed browser API functions.
- `src/client/dashboardModel.ts` — pure card-label/state mapping for actual Home Assistant states.
- `src/client/App.tsx` — one-screen dashboard, control events, asynchronous feedback, repair modal.
- `src/client/styles.css` — exact Stitch-derived design tokens and responsive grid.
- `src/client/main.tsx` — React bootstrapping.
- `src/test/setup.ts` — browser assertions setup.
- `src/server/*.test.ts`, `src/client/*.test.tsx` — regression tests for server and UI behavior.
- `Dockerfile`, `docker-compose.yml`, `.env.example`, `.dockerignore` — single-service Portainer deployment.
- `README.md` — Portainer configuration, token handling, verification and rollback.

### Task 1: Scaffold the typed application and test runner

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Write a failing project smoke test**

Create `src/client/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('dashboard project', () => {
  it('exposes the Norwegian dashboard title', async () => {
    const { dashboardTitle } = await import('../shared/entities');
    expect(dashboardTitle).toBe('Smarthjem');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails because the shared module does not exist**

Run: `npm test -- src/client/smoke.test.ts`

Expected: FAIL with a module-resolution error for `../shared/entities`.

- [ ] **Step 3: Create package tooling and the minimal shared module**

Create `package.json` with scripts `dev`, `build`, `start`, `test`, and `test:watch`; install `@vitejs/plugin-react`, `vite`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `express`, `supertest`, `tsx`, and their TypeScript types. Create `src/shared/entities.ts`:

```ts
export const dashboardTitle = 'Smarthjem';
```

Create `vitest.config.ts` with both `node` and `jsdom` projects or use `environmentMatchGlobs` so `*.test.ts` is node and `*.test.tsx` is jsdom. Configure `src/test/setup.ts` to import `@testing-library/jest-dom/vitest`.

- [ ] **Step 4: Run the smoke test and full type check**

Run: `npm test -- src/client/smoke.test.ts && npx tsc --noEmit`

Expected: PASS with one test and zero TypeScript errors.

- [ ] **Step 5: Commit the scaffold if the directory is initialized as a Git repository**

Run: `git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts index.html src && git commit -m "chore: scaffold wall dashboard"`

Expected: Commit succeeds only after the user initializes Git; otherwise record that the workspace has no repository and proceed without a commit.

### Task 2: Implement the allowlisted Home Assistant REST client with confirmation reads

**Files:**
- Modify: `src/shared/entities.ts`
- Create: `src/server/homeAssistant.ts`
- Create: `src/server/homeAssistant.test.ts`

- [ ] **Step 1: Write failing tests for a command followed by a state confirmation read**

Create `src/server/homeAssistant.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { HomeAssistantClient } from './homeAssistant';

const state = { entity_id: 'input_boolean.toggle', state: 'on', attributes: {} };

describe('HomeAssistantClient', () => {
  it('turns on guest mode and returns the state read after the command', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(state), { status: 200 }));
    const client = new HomeAssistantClient('http://ha:8123', 'secret', fetcher);

    await expect(client.execute('guestMode')).resolves.toEqual({ states: { guestMode: state } });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'http://ha:8123/api/services/input_boolean/turn_on',
      'http://ha:8123/api/states/input_boolean.toggle',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails because the client is missing**

Run: `npm test -- src/server/homeAssistant.test.ts`

Expected: FAIL with a module-resolution error for `./homeAssistant`.

- [ ] **Step 3: Define fixed commands and implement the client**

Expand `src/shared/entities.ts` with the seven named entity IDs, a `DashboardAction` union (`home`, `guestMode`, `morning`, `evening`, `night`, `cooling`), a `HomeAssistantState` interface, and an exported `climateEntityId`. Implement `HomeAssistantClient` in `src/server/homeAssistant.ts` with this public surface:

```ts
export class HomeAssistantClient {
  constructor(baseUrl: string, token: string, fetcher: typeof fetch = fetch) {}
  getDashboardStates(): Promise<{ states: Record<string, HomeAssistantState> }> {}
  execute(action: DashboardAction, option?: 'Hjemme' | 'Borte'): Promise<{ states: Record<string, HomeAssistantState> }> {}
  setTemperature(temperature: number): Promise<{ states: Record<string, HomeAssistantState> }> {}
}
```

Use `Authorization: Bearer <token>` only in server-side requests. `execute` posts only to the fixed service route for its action, includes `{ entity_id }` and `{ option }` only for the home selection, then calls `getState` for every entity affected by the action. Never return headers, tokens, or raw upstream error bodies.

- [ ] **Step 4: Run the unit test and type check**

Run: `npm test -- src/server/homeAssistant.test.ts && npx tsc --noEmit`

Expected: PASS with the service call followed by the state URL call.

- [ ] **Step 5: Add failing boundary tests for temperature confirmation and validation**

Append to `src/server/homeAssistant.test.ts`:

```ts
it('rejects an out-of-range requested temperature before calling Home Assistant', async () => {
  const fetcher = vi.fn();
  const client = new HomeAssistantClient('http://ha:8123', 'secret', fetcher);
  await expect(client.setTemperature(Number.NaN)).rejects.toThrow('Ugyldig temperatur');
  expect(fetcher).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Implement climate bounds from the current entity state and rerun tests**

Before posting `climate.set_temperature`, read `climate.daikinap19531_room_temperature`, read numeric `attributes.min_temp` and `attributes.max_temp`, clamp a finite requested temperature to that interval, post the clamped value, then read and return the climate state. Reject non-finite values with `Ugyldig temperatur`.

Run: `npm test -- src/server/homeAssistant.test.ts && npx tsc --noEmit`

Expected: PASS; the client never issues a service call for `NaN` and confirms successful temperature changes with a fresh read.

### Task 3: Expose a safe Express API

**Files:**
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `src/server/app.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/server/app.test.ts`:

```ts
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app';

describe('dashboard API', () => {
  it('returns confirmed states after a known action', async () => {
    const client = { execute: vi.fn().mockResolvedValue({ states: { guestMode: { state: 'on' } } }) };
    const app = createApp(client as never);
    await request(app).post('/api/actions/guestMode').expect(200, { states: { guestMode: { state: 'on' } } });
    expect(client.execute).toHaveBeenCalledWith('guestMode', undefined);
  });

  it('rejects unknown actions instead of proxying them', async () => {
    const app = createApp({} as never);
    await request(app).post('/api/actions/light.turn_on').expect(404);
  });
});
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `npm test -- src/server/app.test.ts`

Expected: FAIL because `createApp` does not exist.

- [ ] **Step 3: Implement the health, state, action, and temperature routes**

Implement `createApp(client: HomeAssistantClient)` in `src/server/app.ts` with:

```ts
GET  /health                 -> { status: 'ok' }
GET  /api/states             -> await client.getDashboardStates()
POST /api/actions/:action    -> await client.execute(allowlistedAction, parsedOption)
POST /api/temperature        -> await client.setTemperature(parsedNumber)
```

Use a local action set to reject any unrecognized parameter. Accept only `Hjemme` or `Borte` as a `home` option. Convert expected upstream failures to `{ error: 'Kunne ikke oppdatere smarthuset. Prøv igjen.' }` without sensitive details. `src/server/index.ts` must require both environment variables, create the client, listen on `PORT ?? 3000`, and serve Vite build files with an SPA fallback after API routes.

- [ ] **Step 4: Run route tests, all server tests, and type check**

Run: `npm test -- src/server && npx tsc --noEmit`

Expected: PASS; no route accepts a browser-provided entity ID, service name, or access token.

### Task 4: Build the Stitch-locked dashboard client from actual states

**Files:**
- Create: `src/client/api.ts`
- Create: `src/client/dashboardModel.ts`
- Create: `src/client/dashboardModel.test.ts`
- Create: `src/client/App.tsx`
- Create: `src/client/main.tsx`
- Create: `src/client/App.test.tsx`

- [ ] **Step 1: Write failing model tests for actual-state labels**

Create `src/client/dashboardModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { homeLabel, temperatureValue } from './dashboardModel';

describe('dashboard state presentation', () => {
  it('uses Home Assistant returned state for the home label', () => {
    expect(homeLabel({ state: 'Borte', attributes: {} })).toBe('Borte');
  });

  it('uses the returned climate temperature, not a requested value', () => {
    expect(temperatureValue({ state: 'cool', attributes: { temperature: 21 } })).toBe('21 °C');
  });
});
```

- [ ] **Step 2: Run the model tests to verify they fail**

Run: `npm test -- src/client/dashboardModel.test.ts`

Expected: FAIL because `dashboardModel` is absent.

- [ ] **Step 3: Implement typed client requests and pure display mapping**

Implement `getStates`, `runAction`, and `setTemperature` in `src/client/api.ts`, all using same-origin `/api` endpoints and throwing the Norwegian server error value. Implement `homeLabel`, boolean/card status mapping, and `temperatureValue` in `src/client/dashboardModel.ts` to consume only returned `HomeAssistantState` data. Export no Home Assistant URLs or credentials to the browser.

- [ ] **Step 4: Run model tests and type check**

Run: `npm test -- src/client/dashboardModel.test.ts && npx tsc --noEmit`

Expected: PASS with returned entity-state values represented in Norwegian.

- [ ] **Step 5: Write a failing UI confirmation test**

Create `src/client/App.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

it('shows the confirmed guest-mode state returned after pressing its card', async () => {
  const api = {
    getStates: vi.fn().mockResolvedValue({ states: { home: { state: 'Hjemme', attributes: {} }, guestMode: { state: 'off', attributes: {} } } }),
    runAction: vi.fn().mockResolvedValue({ states: { guestMode: { state: 'on', attributes: {} } } }),
    setTemperature: vi.fn(),
  };
  render(<App api={api} />);
  await screen.findByText('Av');
  fireEvent.click(screen.getByRole('button', { name: /gjestemodus/i }));
  await waitFor(() => expect(screen.getByText('På')).toBeInTheDocument());
});
```

- [ ] **Step 6: Implement the one-screen card grid and async state flow**

Implement `App` with dependency-injected `api` for tests and the production API default. Fetch initial states on mount; render cards in this exact order: Hjemme/Borte, Gjestemodus, Morgenmodus, Kveldsmodus, Nattamodus, Kjøl huset, Reparer smarthuset. A card action must set a per-card pending key, invoke the API, merge only confirmed returned states, and clear the pending key. On error, render `Kunne ikke oppdatere smarthuset. Prøv igjen.` inside that card and preserve last confirmed state.

The home card exposes two clearly labeled buttons, `Hjemme` and `Borte`. Cooling has enable action plus `−` and `+` buttons that calculate from the current confirmed temperature; it never updates local temperature until `setTemperature` returns. Mount with `createRoot` in `src/client/main.tsx`.

- [ ] **Step 7: Run UI and all tests**

Run: `npm test -- src/client && npx tsc --noEmit`

Expected: PASS; the UI test proves that visible state changes only after the server response.

### Task 5: Apply exact Stitch visual tokens and repair modal behavior

**Files:**
- Create: `src/client/styles.css`
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`

- [ ] **Step 1: Add a failing repair-modal accessibility test**

Append to `src/client/App.test.tsx`:

```tsx
it('opens and closes the repair iframe modal', async () => {
  render(<App api={{ getStates: vi.fn().mockResolvedValue({ states: {} }), runAction: vi.fn(), setTemperature: vi.fn() }} />);
  fireEvent.click(await screen.findByRole('button', { name: /reparer smarthuset/i }));
  expect(screen.getByTitle('Reparer smarthuset')).toHaveAttribute('src', 'http://192.168.1.127:8080/');
  fireEvent.click(screen.getByRole('button', { name: /lukk/i }));
  expect(screen.queryByTitle('Reparer smarthuset')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the modal test to verify it fails**

Run: `npm test -- src/client/App.test.tsx`

Expected: FAIL because the repair button and dialog are not implemented.

- [ ] **Step 3: Implement the modal and all design tokens in CSS**

Add `:root` variables for Stitch colors, Inter font stack, 32 px page margin, 24 px grid/card padding, 16 px radius, and 56 px minimum target. Use a 12-column CSS grid at tablet landscape sizes, keep the first five cards ordered, make cooling span a larger block, and place repair in the lower-right. Add responsive media rules that retain DOM/card order while moving to fewer columns.

Render `role="dialog" aria-modal="true"` only while repair is open, an iframe with title `Reparer smarthuset`, and a `Lukk` button. The repair card alone uses Stitch red. Card surfaces, top-left thick icons, top-right states, active tints, focus outlines, 2 px pressed motion, and Norwegian labels must match the approved design contract.

- [ ] **Step 4: Run all client tests and build**

Run: `npm test -- src/client && npm run build`

Expected: PASS and Vite produces the production bundle without errors.

### Task 6: Package the service for Portainer and document secure operation

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Add a failing container configuration check**

Create `src/server/deployment.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('deployment configuration', () => {
  it('does not put a Home Assistant token in the compose file', async () => {
    const compose = await readFile('docker-compose.yml', 'utf8');
    expect(compose).toContain('HA_TOKEN=${HA_TOKEN}');
    expect(compose).not.toMatch(/eyJ[a-zA-Z0-9._-]{20,}/);
  });
});
```

- [ ] **Step 2: Run the deployment test to verify it fails**

Run: `npm test -- src/server/deployment.test.ts`

Expected: FAIL because `docker-compose.yml` does not exist.

- [ ] **Step 3: Create the image and Compose stack**

Create a multi-stage `Dockerfile`: build with Node 22 Alpine, then run the compiled server as an unprivileged user on port 3000. Create `docker-compose.yml` with one `wall-dashboard` service, `build: .`, explicit `HA_URL=${HA_URL}`, `HA_TOKEN=${HA_TOKEN}`, `PORT=3000`, `restart: unless-stopped`, port mapping `${DASHBOARD_PORT:-3000}:3000`, and a `wget`/Node HTTP healthcheck against `/health`. Do not add a database, volume, or host mount.

Create `.env.example` with `HA_URL=http://192.168.1.78:8123`, an empty `HA_TOKEN=`, and `DASHBOARD_PORT=3000`; it must not include any real token. Exclude `.env`, `node_modules`, `dist`, and coverage output in `.dockerignore`.

Document in `README.md`: create a dedicated Home Assistant long-lived token, configure Portainer stack variables, paste `HA_TOKEN` only in Portainer, deploy stack as a local production service, open `http://<proxmox-host>:3000`, view logs/health, update image/stack, and roll back by redeploying the previous image. Note the iframe service must permit framing from the dashboard origin.

- [ ] **Step 4: Run deployment test, full tests, build, and local Compose validation**

Run: `npm test && npm run build && docker compose config`

Expected: all tests pass, build exits zero, and Compose prints a valid single-service configuration without secret token content.

### Task 7: Complete requirement-by-requirement verification and deploy when Portainer access is available

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Verify every explicit dashboard control in source and tests**

Run: `rg -n "input_select.home_state|input_boolean.toggle|automation.modus_god_morgen|script.1572988362234|script.1569099501074|automation.klima_automatisk_kjoling_optimalisert|climate.daikinap19531_room_temperature|192.168.1.127:8080" src README.md`

Expected: every required entity/action/repair URL appears in the allowlist and its test or UI implementation.

- [ ] **Step 2: Run fresh full verification**

Run: `npm test && npm run build && docker compose config`

Expected: zero test failures, a successful production build, and valid Compose configuration.

- [ ] **Step 3: Deploy through Portainer after collecting environment ID and stack name**

Create/update the named stack in the target Portainer environment with `HA_URL` and `HA_TOKEN` configured only in Portainer. Do not use `prune` unless the user explicitly authorizes removal of changed services.

- [ ] **Step 4: Verify deployed operation from the target network**

Open the dashboard in the Huawei MatePad T browser, check `/health`, inspect stack/container health and logs, and manually execute each requested operation. For each control, verify the dashboard visible state is the Home Assistant state returned after the command. Verify `Reparer smarthuset` iframe access; if it is blocked by `X-Frame-Options` or CSP, record the upstream header and configure that separate repair service to permit dashboard framing.

- [ ] **Step 5: Commit and publish only if Git/remote are later configured**

Run: `git add . && git commit -m "feat: add Home Assistant wall dashboard"`

Expected: Commit is intentionally deferred until a Git repository exists; Portainer deployment does not require it.

## Plan self-review

- **Spec coverage:** Tasks 2–5 implement all dashboard entities, command/confirmation semantics, Norwegian UI, exact Stitch grid/tokens, errors, and iframe modal. Tasks 6–7 cover the one-service Docker/Portainer deployment and verification.
- **No-placeholder scan:** All files, service names, endpoint paths, entity IDs, expected commands, and acceptance checks are explicit. Portainer environment/stack-name values remain external user-provided inputs and are not invented.
- **Type consistency:** `DashboardAction`, `HomeAssistantState`, `HomeAssistantClient`, `createApp`, and client API functions retain the same names across every task.
