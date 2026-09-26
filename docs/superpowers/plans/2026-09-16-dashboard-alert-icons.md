# Compact Dashboard Alert Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Variant C urgent strip with accessible compact alert icons and detailed modal views.

**Architecture:** A pure `prototypeAlertModel` derives typed descriptors from Home Assistant state and the prototype scenario. The dashboard maps descriptors into its existing modal shell while retaining a single focus-restoration owner.

**Tech Stack:** TypeScript, React 18, Vitest, Testing Library, CSS.

**Spec:** `docs/specs/2026-09-16-dashboard-alert-icons.md`

## Global Constraints

- Preserve Variant C clock/date placement and lane layout.
- Do not create a door-unlocked descriptor.
- MET entries must continue to use `meteoAlarmEntries` filtering and `meteoEventMeta` icon metadata.

---

### Task 1: Typed alert model

**Files:**
- Create: `src/client/prototypeAlertModel.ts`
- Test: `src/client/prototypeAlertModel.test.ts`

**Interfaces:**
- Produces: `prototypeAlertDescriptors(states, scenario, now): PrototypeAlertDescriptor[]`

- [ ] **Step 1: Write failing unit tests** for MET, lightning, gust, aurora, scenario charging, and an unlocked door.
- [ ] **Step 2: Run** `npm.cmd test -- src/client/prototypeAlertModel.test.ts` and confirm the missing-model failure.
- [ ] **Step 3: Implement** pure descriptors using `meteoAlarmEntries`, `meteoEventMeta`, the existing 10 m/s gust threshold, and existing lightning/aurora thresholds.
- [ ] **Step 4: Run** the focused model tests and confirm they pass.

### Task 2: Dashboard controls and modal behavior

**Files:**
- Modify: `src/client/MainDashboardPrototype.tsx`
- Modify: `src/client/MainDashboardPrototype.test.tsx`
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes: `prototypeAlertDescriptors` and `PrototypeAlertDescriptor`.

- [ ] **Step 1: Write failing component tests** for keyboard MET activation, complete MET detail content, Escape close, and focus restoration.
- [ ] **Step 2: Run** `npm.cmd test -- src/client/MainDashboardPrototype.test.tsx` and confirm the new expectation fails.
- [ ] **Step 3: Replace** `UrgentStrip` with the named heading-row icon group, map descriptor content into the existing modal, and retain the invoking element before opening.
- [ ] **Step 4: Add** responsive circular icon styles and remove urgent-strip styles.
- [ ] **Step 5: Run** focused component tests and confirm they pass.

### Task 3: Release verification

**Files:**
- Verify: changed files and documentation.

- [ ] **Step 1: Run** `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.
- [ ] **Step 2: Preview** `http://127.0.0.1:5173/?variant=C&scenario=warning` and stop only the verified project process tree.
- [ ] **Step 3: Commit and push** the verified branch.
- [ ] **Step 4: Rediscover and restart only** Portainer stack `homeassistant-wall-dashboard-v2`, preserving its environment variables, then verify `/health` and `/` at port 3200.
