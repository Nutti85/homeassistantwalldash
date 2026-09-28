# Responsive Dashboard Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep dashboard cards aligned, readable, and usable across narrow phones, tablets in both orientations, the wall tablet, and desktop screens.

**Architecture:** Keep the existing React card components and CSS Grid. Reflow each dashboard's outer grid at the width its content actually needs; let card internals adapt to their available width. Preserve saved desktop card placements while using a predictable document flow on narrow screens.

**Tech Stack:** React, TypeScript, CSS Grid, Vite, Vitest.

**Spec:** The user's 2026-09-28 request extends `docs/dashboard-redesign/IMPLEMENTATION_BRIEF.md` beyond its original tablet-only scope. Preserve that brief's wall-tablet composition and no-overlap requirements.

## Global Constraints

- Preserve the existing V2 visual language and card order: Siden sist, Akkurat nå, Dette skjer.
- At 1920 × 1200 landscape, keep the existing wall-tablet composition without page scrolling.
- At smaller viewports, allow vertical page scrolling; no card may overlap, clip essential content, or cause horizontal page scrolling.
- Keep touch controls at least 48 px where the current design requires it, visible focus, and usable keyboard order.
- Do not add a grid library or replace the existing cards.
- Preserve the current uncommitted weather-chart changes in `src/client/styles.css` and `src/client/WeatherOverview.tsx`.

---

### Task 1: Reflow the V2 outer grid

**Files:** Modify `src/client/styles.css`; inspect `src/client/MainDashboardPrototype.tsx` for DOM order.

- [ ] Capture the current V2 layout at 1920×1200, 1280×800, 1024×768, 768×1024, 390×844, and 320×568, including the breakpoint boundaries at 700/701 and 1100/1101 px.
- [ ] Replace the V2 three-column minimum-width tracks with width ranges that fit their content: three columns only when all three minimums plus gaps and page padding fit; two columns at intermediate widths; one column when two useful columns no longer fit. Keep DOM reading order in each range.
- [ ] Make the past-zone control rail and the fixed bottom controls follow those same layout transitions without covering content or forcing overflow.
- [ ] Recheck the wall-tablet layout and the exact widths on either side of each transition.
- [ ] Commit the V2 outer-grid change after visual review.

### Task 2: Make card interiors fit their grid tracks

**Files:** Modify `src/client/styles.css`; modify `src/client/WeatherOverview.tsx` only if the chart's sizing cannot be fixed in CSS.

- [ ] Inspect weather, agenda, camera, Siden sist, task, and modal content at the six viewport sizes, with long real-looking text and empty/error states.
- [ ] Use existing `minmax(0, 1fr)`, `min-width: 0`, `clamp()`, wrapping, and container queries where a card's width matters more than page width. Keep camera and chart aspect ratios readable; allow internal scrolling only for intentionally bounded regions.
- [ ] Remove conflicting later CSS overrides in the touched rules instead of adding another layer of breakpoint patches.
- [ ] Verify text at 200% zoom and landscape phone height without clipped controls.
- [ ] Commit the card-sizing change after visual review.

### Task 3: Reflow legacy Regular, Guest, and Child modes

**Files:** Modify `src/client/styles.css` and, only if needed for the edit control, `src/client/App.tsx`.

- [ ] Inspect all three modes at the same viewport sizes. Confirm which fixed-height rows, `24 × 8` grid placements, header controls, and saved inline placements prevent reflow.
- [ ] Keep saved positions and resizing on the wide wall layout. At compact widths, render cards in a stable, readable flow that does not depend on saved desktop coordinates; make the edit control unavailable there if editing cannot operate correctly.
- [ ] Use content-sized rows and a smaller number of columns at compact widths; preserve a clear card gap and the current reading order.
- [ ] Verify Guest and Child modes as well as Regular, including an existing saved custom layout.
- [ ] Commit the legacy-layout change after visual review.

### Task 4: Verify the device matrix and finish

**Files:** Add a small browser layout check only if existing test tooling can run it without a new dependency; otherwise keep a recorded manual viewport matrix in this plan.

- [ ] At each matrix size, check `document.documentElement.scrollWidth <= window.innerWidth`, top-level card rectangles do not intersect, controls remain visible, and keyboard focus follows the displayed order.
- [ ] Check 1920×1200 landscape with no page scrolling; allow page scrolling at narrower sizes. Inspect both 700/701 and 1100/1101 boundaries and 200% zoom.
- [ ] Run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`; review the final diff for changes to the existing uncommitted weather work.
- [ ] Make the final local commit and report any device-specific limits found during visual review. Do not push or deploy as part of this plan.

## Implementation verification record

On 2026-09-28, local Chromium checks covered 320×844, 390×844, 700×800, 701×800, 768×1024, 800×800, 801×800, 960×600, 1024×768, 1050×800, 1051×800, 1100×800, 1101×800, 1280×800, and 1920×1200. V2 and all three legacy modes had no intersecting top-level grid rectangles or horizontal page overflow. The 1920×1200 V2 page fit the viewport without vertical scrolling. A saved custom Regular placement did not change compact card flow. The 960×600 check represents the CSS viewport of a 1920×1200 screen at 200% zoom. Physical tablet review remains to be done on the device.
