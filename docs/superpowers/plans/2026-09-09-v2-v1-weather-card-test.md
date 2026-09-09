# V2 V1 Weather Card Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing V1 weather overview inside the V2 “Akkurat nå” lane as a test, while retaining the current V2 weather-card implementation for later comparison or rollback.

**Architecture:** Extract the shared V1 overview card and its chart/glyph/wind helpers into a dedicated weather component module. V1 and V2 will then share one source of truth for the legacy card, while `WeatherFocus` remains in `MainDashboardPrototype.tsx` untouched as the retained V2 implementation. The V2 host will render the extracted legacy card with a V2-specific class that preserves the V2 surface styling and constrains the chart to the available lane height.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing CSS/SVG weather chart implementation.

**Spec:** `docs/dashboard-redesign/IMPLEMENTATION_BRIEF.md` (weather-card ownership, responsive/overflow rules, accessibility, and chart requirements)

## Global Constraints

- Keep the existing V2 weather card code in `src/client/MainDashboardPrototype.tsx`.
- Use the existing weather entities and typed `forecastPoints` model; do not add browser-side Home Assistant access.
- Preserve the V1 card’s accessible detail-weather activation and keyboard behavior.
- Keep the V2 visual language: dark flat surfaces, existing spacing/tokens, and no new design system.
- Do not modify unrelated working-tree changes.
- Before completion on `codex/dashboard-prototype-v2`, run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`; commit and push the verified branch, then deploy only the discovered `homeassistant-wall-dashboard-v2` Portainer stack and verify its health/dashboard endpoints.

### Task 1: Extract the V1 weather overview into a reusable component

**Files:**
- Create: `src/client/WeatherOverview.tsx`
- Modify: `src/client/App.tsx` to import the extracted component and remove only the moved V1 weather helpers/usages
- Test: `src/client/App.test.tsx` existing V1 weather overview coverage, plus any import-facing adjustments needed by the extraction

**Interfaces:**
- Consumes: `states: Record<string, HomeAssistantState>`, `regular?: boolean`, `onDetails?: () => void`, and optional `className?: string`.
- Produces: exported `WeatherOverview` component with the current V1 DOM, SVG chart, glyph mapping, wind reading, and keyboard-accessible detail activation.

- [ ] **Step 1: Write the failing extraction contract test**

Add a focused assertion in `src/client/App.test.tsx` that the normal V1 dashboard still renders the weather card with `.weather-regular`, a `.weather-chart`, and the current weather reading after the component is moved. Keep the assertion on rendered behavior rather than the module location.

- [ ] **Step 2: Run the focused test and confirm it fails for the intended reason**

Run:

```powershell
npm.cmd test -- src/client/App.test.tsx
```

Expected: the new contract test fails only after the temporary extraction boundary is introduced, not because of a test syntax or fixture error.

- [ ] **Step 3: Move the V1 implementation without changing behavior**

Move `WeatherGlyph`, `WindReading`, `WeatherChart`, `smoothPath`, compass helpers, and `WeatherOverview` into `src/client/WeatherOverview.tsx`. Export `WeatherOverview`; keep `WeatherMetricSvg` and `WeatherAccordion` in `App.tsx` because they are separate V1 detailed-weather accordion behavior. Add `className` composition to the root without changing the default class list.

- [ ] **Step 4: Run the V1 client tests and confirm they pass**

Run:

```powershell
npm.cmd test -- src/client/App.test.tsx
```

Expected: all existing V1 weather/detail tests and the new extraction contract test pass.

### Task 2: Render the V1 card in V2 and adapt its footprint

**Files:**
- Modify: `src/client/MainDashboardPrototype.tsx` to import `WeatherOverview`, retain `WeatherFocus`, and select the V1 card for the V2 weather slot
- Modify: `src/client/styles.css` to scope V2 compatibility rules to the legacy card
- Test: `src/client/MainDashboardPrototype.test.tsx`

**Interfaces:**
- Consumes: the exported `WeatherOverview` component from Task 1 and the existing `showWeather` callback.
- Produces: V2 “Akkurat nå” weather slot with V1 weather/current condition, wind reading, and combined forecast chart; the old `WeatherFocus` implementation remains available in source.

- [ ] **Step 1: Write the failing V2 behavior test**

Add a test named `uses the V1 weather overview in the V2 now lane while retaining the V2 weather implementation` that renders `MainDashboardPrototype` with populated daily/hourly weather states, asserts the V2 host contains one `.weather-regular` card with `.weather-chart`, asserts the five `.ppf-weather-tiles` are absent, and verifies the card still calls `showWeather` when activated. Keep the existing V2 tile test changed only as needed to describe the retained implementation rather than the active default.

- [ ] **Step 2: Run the V2 test and verify the expected failure**

Run:

```powershell
npm.cmd test -- src/client/MainDashboardPrototype.test.tsx
```

Expected: the new behavior assertion fails because V2 currently renders `.ppf-weather-tiles` through `WeatherFocus`.

- [ ] **Step 3: Switch the V2 slot to the extracted V1 card**

Import `WeatherOverview` in `MainDashboardPrototype.tsx` and render it in the V2 weather slot with `regular` and `onDetails={props.showWeather}`. Leave `WeatherFocus` and its V2 tile markup in the file, clearly labeled as the retained V2 implementation. Add a class such as `ppf-weather-v1` to make the temporary test path explicit.

- [ ] **Step 4: Add scoped V2 layout adaptation**

Add rules after the existing V2 cascade so `.main-dashboard-prototype .ppf-weather-v1` gets the V2 border/radius/background and `min-width: 0; min-height: 0; overflow: hidden`. At the large landscape breakpoint, give its `.weather-top` compact two-column sizing, keep `.weather-chart-wrap` inside the card with `min-height: 0`, and scale chart/legend typography to fit the V2 “Akkurat nå” lane. Preserve the V1 responsive rules outside the V2 scope.

- [ ] **Step 5: Run the V2 client tests and confirm they pass**

Run:

```powershell
npm.cmd test -- src/client/MainDashboardPrototype.test.tsx src/client/App.test.tsx
```

Expected: the V2 legacy-card test, retained-implementation test, and all existing V1/V2 client tests pass.

### Task 3: Verify the finished test variant and branch requirements

**Files:**
- Modify: none unless verification exposes a scoped defect

**Interfaces:**
- Consumes: completed Tasks 1–2.
- Produces: verified V2 test variant, committed branch, pushed branch, and V2 deployment health check.

- [ ] **Step 1: Run the full test suite**

```powershell
npm.cmd test
```

- [ ] **Step 2: Run the production build and whitespace check**

```powershell
npm.cmd run build
git diff --check
```

- [ ] **Step 3: Inspect the diff and commit only the weather-card change**

Review `git status --short` and `git diff -- src/client/App.tsx src/client/MainDashboardPrototype.tsx src/client/WeatherOverview.tsx src/client/MainDashboardPrototype.test.tsx src/client/App.test.tsx src/client/styles.css`. Preserve the pre-existing `scripts/dev.mjs` and mockup-asset changes. Commit with:

```powershell
git add src/client/App.tsx src/client/MainDashboardPrototype.tsx src/client/WeatherOverview.tsx src/client/MainDashboardPrototype.test.tsx src/client/App.test.tsx src/client/styles.css docs/superpowers/plans/2026-09-09-v2-v1-weather-card-test.md
git commit -m "test: show v1 weather card in v2"
```

- [ ] **Step 4: Push the branch**

```powershell
git push origin codex/dashboard-prototype-v2
```

- [ ] **Step 5: Re-discover and restart only the V2 Portainer stack**

Use the connected Portainer tooling to discover the environment and the stack named `homeassistant-wall-dashboard-v2`, preserve all existing stack environment variables, stop/start that stack, and do not mutate `homeassistant-wall-dashboard`.

- [ ] **Step 6: Verify the deployed V2 endpoints**

Check that the V2 stack is active and that `http://192.168.1.50:3200/health` and `http://192.168.1.50:3200/` respond successfully before reporting completion.
