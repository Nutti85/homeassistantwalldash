# Bottom-control grouping

## Problem
The V2 main dashboard bottom controls currently render the home controls, scenes, and safety controls as three equally prominent groups. The approved prototype establishes a clearer hierarchy with scenes standing alone, while all everyday controls—including lock and security—form one centered control group.

## Intended behavior
- Render `Morgen`, `Kveld`, and `Natt` as the standalone `Scener` group on the left.
- Render one centered `Hjemmekontroller` group containing: Lys, Klima, Støvsuger, Biler, Modus, Klara, door lock, and security.
- Preserve existing actions, pending/error behavior, selected-scene confirmation, and Home Assistant state-derived lock/security labels.
- Preserve V1 Material Symbols: `lightbulb`, `mode_fan`, `vacuum`, `directions_car`, `tune`, `auto_awesome`, `lock`/`lock_open`, and `shield`.
- `Modus` continues to call the existing `openMode` handler, which opens the existing `Dashboardmodus` modal with Full, Gjest, and Barn.

## UX constraints
- Desktop: the scene group is visually independent to the left; the eight-button home group is mathematically centered in the bottom bar.
- Buttons remain at least 55 px high and at least 64 px wide on desktop.
- Preserve the current WallDash glass panels, mint interaction state, warm scene/safety accents, keyboard focus treatment, and responsive behavior.
- On narrow viewports, maintain source order: scenes first, then the combined home group. Do not introduce horizontal scrolling.

## Non-goals
- No Home Assistant API changes, new actions, new modal component, or production deployment.
- Do not modify unrelated dashboard layouts or prototype artifacts.

## Acceptance criteria
1. The bottom navigation exposes exactly three scene buttons in `Scener` and eight buttons in `Hjemmekontroller`.
2. `Modus` invokes the existing `openMode` callback.
3. Lock and security controls remain state-aware and invoke `unlockDoor`/`lockDoor` and `securityMode` exactly as before.
4. Desktop visual layout has standalone scenes left and centered combined controls; narrow layout remains usable without clipping.
5. Targeted tests, full test suite, production build, and `git diff --check` pass.