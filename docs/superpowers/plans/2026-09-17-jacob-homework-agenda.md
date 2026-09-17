# Jacob Homework Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Jacob's homework visible in Hendelser through its due date and enable local completion.

**Architecture:** A focused client helper derives stable homework IDs, the active Monday–due-date range, and locally persisted completions. The existing agenda consumes those derived entries and passes a completion callback into its established detail modal.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, browser localStorage.

**Spec:** `docs/specs/2026-09-17-jacob-homework-agenda.md`

## Global Constraints

- Preserve the existing Hendelser and detail-modal visual language.
- Persist only this device's completion presentation state; never mutate Home Assistant source data.

---

### Task 1: Homework agenda domain helper

**Files:**
- Create: `src/client/homeworkAgenda.ts`
- Create: `src/client/homeworkAgenda.test.ts`

- [ ] Write failing tests for a Friday homework being active Monday through Friday, excluded before/after its week, and retained in local completion storage.
- [ ] Run `npm.cmd test -- src/client/homeworkAgenda.test.ts` and confirm the tests fail because the helper is absent.
- [ ] Implement the minimal range, ID, and completion-storage helpers.
- [ ] Re-run the focused helper test and confirm it passes.

### Task 2: Agenda completion interaction

**Files:**
- Modify: `src/client/MainDashboardPrototype.tsx`
- Modify: `src/client/MainDashboardPrototype.test.tsx`

- [ ] Write failing UI coverage for an active Friday homework on Monday and its removal on **Ferdig**.
- [ ] Run `npm.cmd test -- src/client/MainDashboardPrototype.test.tsx` and confirm the new test fails.
- [ ] Wire the helper into the agenda and existing detail modal, preserving other agenda items.
- [ ] Re-run focused UI tests, then `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.
