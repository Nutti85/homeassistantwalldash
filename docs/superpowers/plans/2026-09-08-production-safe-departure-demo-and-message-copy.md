# Production-safe departure demo and message copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the test departure briefing out of the V2 Portainer build, slow message scrolling, and rename the family agenda to `Hendelser`.

**Architecture:** The client already distinguishes a V2 production build through `VITE_DASHBOARD_VERSION`. Use that signal only to disable locally generated departure fixtures; preserve server-provided departure briefings. The remaining changes are presentation-only in the established prototype component and stylesheet.

**Tech Stack:** React, TypeScript, Vitest, Vite, CSS.

**Spec:** User request, 2026-09-08.

## Global Constraints

- V2 Portainer builds set `VITE_DASHBOARD_VERSION=v2`.
- Do not change Home Assistant data contracts or deploy the V1 stack.
- Preserve the established WallDash visual language and reduced-motion behavior.

---

### Task 1: Gate demo-only departure data

**Files:**
- Modify: `src/client/App.tsx`
- Test: `src/client/App.test.tsx`

**Interfaces:**
- Consumes: `VITE_DASHBOARD_VERSION` and the optional `departureBriefings` API field.
- Produces: demo data only for local prototype routes; API data remains untouched.

- [ ] **Step 1: Write a failing test** that simulates a V2 build with no API briefing and asserts that no departure preview or modal is rendered.
- [ ] **Step 2: Run** `npm.cmd test -- src/client/App.test.tsx` and confirm the test fails because the fixture is currently injected for V2.
- [ ] **Step 3: Implement** a `canUseDepartureDemo` guard that is false for V2 builds, and use it around both query fixtures and the default demo payload.
- [ ] **Step 4: Run** `npm.cmd test -- src/client/App.test.tsx` and confirm it passes.

### Task 2: Adjust agenda copy and marquee pace

**Files:**
- Modify: `src/client/MainDashboardPrototype.tsx`
- Modify: `src/client/styles.css`
- Test: `src/client/MainDashboardPrototype.test.tsx`

**Interfaces:**
- Consumes: existing `Surface` heading props and `.ppf-message-marquee-track` animation.
- Produces: an agenda labeled `Hendelser` and a slower continuous message animation.

- [ ] **Step 1: Write failing component assertions** for the `Hendelser` heading and the absence of the old agenda copy.
- [ ] **Step 2: Run** `npm.cmd test -- src/client/MainDashboardPrototype.test.tsx` and confirm the heading assertion fails.
- [ ] **Step 3: Implement** the new agenda title without the `Neste` eyebrow, and increase marquee animation duration without changing its motion model.
- [ ] **Step 4: Run** `npm.cmd test -- src/client/MainDashboardPrototype.test.tsx` and confirm it passes.

### Task 3: Verify and deploy V2

**Files:**
- Verify: `src/client/App.tsx`, `src/client/MainDashboardPrototype.tsx`, `src/client/styles.css`, `docker-compose.portainer.v2.yml`

- [ ] **Step 1: Run** `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.
- [ ] **Step 2: Commit** the verified changes and push `codex/dashboard-prototype-v2` to `origin`.
- [ ] **Step 3: Re-discover** the Portainer V2 stack, restart only `homeassistant-wall-dashboard-v2`, and verify `http://192.168.1.50:3200/health` and `/`.
