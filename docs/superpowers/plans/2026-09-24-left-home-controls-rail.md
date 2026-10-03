# Left Home Controls Rail beside Siden sist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the eight home shortcut buttons from the bottom bar into a vertical rail immediately left of Siden sist, taking width from that area while leaving the other dashboard columns and the three scene buttons alone.

**Architecture:** Keep the existing three-column layout for Siden sist, Akkurat nå, and Dette skjer. Wrap the rail and Siden sist section in a nested grid that occupies the existing first column, so the rail reduces only Siden sist’s content width. Keep Morgen, Kveld, and Natt in the bottom scene control group, with their current confirm interaction and styling.

**Tech Stack:** React, TypeScript, CSS, Vitest.

**Spec:** User request in the 2026-09-24 task. Apply alongside the landscape wall-display constraints in `docs/dashboard-redesign/IMPLEMENTATION_BRIEF.md` and the current layout in `src/client/MainDashboardPrototype.tsx`.

## Global Constraints

- Target the landscape wall dashboard; at 1920 × 1200 it must fit without page scrolling, overlap, clipping, or obscuring a card.
- Preserve the existing warm dashboard style, labels, control order, action handlers, and live lock/security labels.
- Keep the Siden sist / Akkurat nå / Dette skjer column order and the latter two columns’ existing outer grid tracks.
- Keep Morgen, Kveld, and Natt in the bottom scene controls with the current confirmation behavior.
- Keep controls keyboard reachable and visibly focused, with touch targets at least 48 px high.
- At narrower breakpoints, keep the controls usable in a compact bottom layout rather than squeezing the new vertical rail into Siden sist.

---

## File Map

- `src/client/MainDashboardPrototype.tsx` — split the home shortcuts from the scene controls and place the rail beside Siden sist.
- `src/client/styles.css` — add the nested first-column layout, rail styling, and narrow-screen fallback while preserving existing visual tokens.
- `src/client/MainDashboardPrototype.test.tsx` — keep the current control presence and action-wiring assertions accurate if the navigation landmarks are separated.

## Task 1: Separate the Home Shortcuts from Scene Controls

**Files:**
- Modify: `src/client/MainDashboardPrototype.tsx` around `BottomControls` and the `ppf-c-zones` composition.
- Modify: `src/client/MainDashboardPrototype.test.tsx` around the home-control assertions.

**Interfaces:**
- `HomeControlRail` consumes the existing `PrototypeProps` callbacks, state, pending, and error values used by `BottomControls`.
- `SceneControls` keeps its existing action, pending, and errors inputs and remains the only group at the bottom.

- [ ] Extract the existing eight shortcut buttons (Lys, Klima, Støvsuger, Biler, Modus, Klara, door lock, and security mode) into a `HomeControlRail` landmark named `Hjemkontroller`. Preserve each current callback and the state-dependent labels for the lock and security buttons.
- [ ] Add a `ppf-past-layout` wrapper around the new rail and the existing `ppf-zone-past` section. Keep `ppf-zone-now` and `ppf-zone-future` as the other two direct grid items.
- [ ] Keep `SceneControls` in the bottom controls container and retain its `Scener` group, button labels, confirm button, pending state, and error display.
- [ ] Update the existing component assertions so they query the separated landmarks and still verify that every shortcut and each scene button is present. Keep the existing click assertions for Modus, door lock, security mode, and scene confirmation.

In `ppf-c-zones`, make the first child a `ppf-past-layout` wrapper. Its children, in order, are `HomeControlRail` and the complete existing `ppf-zone-past` section. Keep `ppf-zone-now` and `ppf-zone-future` as the next two children. Render the existing `SceneControls` through the bottom controls container, separate from the rail.

## Task 2: Style the Rail and Preserve Responsive Layout

**Files:**
- Modify: `src/client/styles.css` near the `.ppf-c-zones`, `.ppf-bottom-controls`, and existing responsive rules.

**Interfaces:**
- Desktop rail and Siden sist share the current first grid column; the other two grid tracks remain as defined today.
- The narrow-screen layout presents the same controls in the bottom area and keeps the current stacked dashboard flow.

- [ ] Make `.ppf-past-layout` a two-track nested grid with an approximately 88 px rail and a `minmax(0, 1fr)` Siden sist track. Keep the outer `.ppf-c-zones` track definitions unchanged so the rail takes its space from Siden sist only. The desktop rule should have this shape:

      .ppf-past-layout {
        display: grid;
        grid-template-columns: 88px minmax(0, 1fr);
        gap: 8px;
        min-width: 0;
      }
- [ ] Style the rail as a single vertical column using the existing surface, border, icon, spacing, and active-state language. Keep labels visible and allow longer dynamic labels to wrap; keep buttons at least 48 px high and retain a clear focus-visible style.
- [ ] Keep the scene group anchored at the bottom. Remove or revise any shared bottom-bar selectors that assume the home shortcuts are still children of that group.
- [ ] At widths where the wall-screen composition no longer fits, collapse `.ppf-past-layout` to one column and display the controls as a compact two-row bottom dock: scenes on the upper row and home shortcuts on the lower row. Preserve the existing Siden sist stacking order and reserve enough bottom space to prevent overlap.

## Task 3: Verify the Layout and Interactions

**Files:**
- Review: `src/client/MainDashboardPrototype.test.tsx` and `src/client/styles.css`.

- [ ] At 1920 × 1200, confirm the vertical shortcut rail sits immediately left of Siden sist, the Siden sist cards use the reduced width, Akkurat nå and Dette skjer keep their current tracks, and no content is covered or clipped.
- [ ] Confirm Morgen, Kveld, and Natt remain in the bottom scene group and still require the existing confirm action.
- [ ] Confirm every home shortcut remains keyboard accessible and invokes its current action; check both dynamic door/security labels and long-label wrapping.
- [ ] Check the fallback at 1100 px wide and below, including a narrow/mobile viewport: the rail becomes a compact bottom row, the scene controls remain visible, and the dashboard keeps its current stacking behavior.
- [ ] Run the existing relevant component tests and project build when implementing this plan; do not change Home Assistant APIs or state behavior.

## Acceptance Criteria

- The home shortcuts form one vertical bar immediately left of Siden sist on the wall-display layout.
- The rail’s width comes from Siden sist; Akkurat nå and Dette skjer retain their existing layout and order.
- Morgen, Kveld, and Natt remain at the bottom with unchanged labels and confirmation behavior.
- All existing home shortcut actions and dynamic labels continue to work.
- Narrow screens retain accessible bottom controls without horizontal overflow or overlap.
