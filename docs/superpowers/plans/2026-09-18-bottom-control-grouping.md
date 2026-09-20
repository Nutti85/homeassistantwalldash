# Bottom-control grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved bottom-control grouping: standalone scene controls plus a centered, combined home-control group containing Modus, lock, and security.

**Architecture:** Keep the existing `BottomControls` component and its existing callbacks. Change only its DOM grouping and its component-scoped CSS: move the state-derived lock and security buttons into the home group, leave `SceneControls` as an independent sibling, and use CSS Grid to position the scene group on the left while keeping the combined group centered. Reuse the existing `DashboardModeModal` via `openMode`; no modal, API, or entity model is added.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, CSS, Vite.

**Spec:** `docs/specs/2026-09-18-bottom-control-grouping.md`

## Global Constraints

- Preserve current Home Assistant actions: `morning`, `evening`, `night`, `lockDoor`, `unlockDoor`, and `securityMode`.
- Preserve the V1 Material Symbol names `lightbulb`, `mode_fan`, `vacuum`, `directions_car`, `tune`, `auto_awesome`, `lock`/`lock_open`, and `shield`.
- Reuse `openMode`; do not create a new dashboard-mode modal.
- Keep the existing dark glass, mint, and warm WallDash tokens and focus behavior.
- Do not deploy or alter the standalone prototype as part of this implementation.

---

### Task 1: Lock the approved control semantics with tests

**Files:**
- Modify: `src/client/MainDashboardPrototype.test.tsx`

**Interfaces:**
- Consumes: `MainDashboardPrototype` props `openMode: () => void` and `action: (key: DashboardAction) => void`.
- Produces: regression coverage for the bottom navigation’s grouping, mode callback, and state-aware safety actions.

- [ ] **Step 1: Extend the local test render helper so a test can supply `openMode`.**

```tsx
const renderPrototype = (
  states: Record<string, HomeAssistantState> = {},
  action = vi.fn(),
  openMode = vi.fn(),
) => render(<MainDashboardPrototype
  states={states}
  showWeather={() => {}}
  openLights={() => {}}
  openHeatPump={() => {}}
  openVacuum={() => {}}
  openVehicles={() => {}}
  openMode={openMode}
  openKlaraAi={() => {}}
  openDeparture={() => {}}
  hasDepartureBriefing={false}
  action={action}
/>);
```

- [ ] **Step 2: Add a failing test for the two approved groups and the Modus callback.**

```tsx
it('keeps scenes separate and centers all daily controls in one home group', () => {
  const openMode = vi.fn();
  renderPrototype({}, vi.fn(), openMode);

  const nav = screen.getByRole('navigation', { name: 'Hjemkontroller' });
  const scenes = within(nav).getByRole('group', { name: 'Scener' });
  const home = within(nav).getByRole('group', { name: 'Hjemmekontroller' });

  expect(within(scenes).getAllByRole('button')).toHaveLength(3);
  ['Morgen', 'Kveld', 'Natt'].forEach((name) => expect(within(scenes).getByRole('button', { name })).toBeInTheDocument());
  ['Lys', 'Klima', 'Støvsuger', 'Biler', 'Modus', 'Klara', 'Låst', 'Overvåket']
    .forEach((name) => expect(within(home).getByRole('button', { name })).toBeInTheDocument());

  fireEvent.click(within(home).getByRole('button', { name: 'Modus' }));
  expect(openMode).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Add a failing test for state-derived safety actions after they move into the home group.**

```tsx
it('preserves lock and security actions inside the home group', () => {
  const action = vi.fn();
  renderPrototype({
    frontDoorLock: state('lock.front_door', 'locked'),
    securityMode: state('input_number.security_mode', '1'),
  }, action);

  const home = screen.getByRole('group', { name: 'Hjemmekontroller' });
  fireEvent.click(within(home).getByRole('button', { name: 'Låst' }));
  fireEvent.click(within(home).getByRole('button', { name: 'Overvåket' }));

  expect(action).toHaveBeenCalledWith('unlockDoor');
  expect(action).toHaveBeenCalledWith('securityMode');
});
```

- [ ] **Step 4: Run the targeted test to establish the expected failure.**

Run: `npm.cmd test -- MainDashboardPrototype.test.tsx`

Expected: FAIL because lock/security remain in `Sikkerhet`, or because `Hjemmekontroller` does not yet contain the new controls.

- [ ] **Step 5: Commit the test-only change.**

```powershell
git add src/client/MainDashboardPrototype.test.tsx
git commit -m "test: define grouped bottom-control behavior"
```

### Task 2: Restructure `BottomControls` without changing its behavior

**Files:**
- Modify: `src/client/MainDashboardPrototype.tsx:221-225`
- Test: `src/client/MainDashboardPrototype.test.tsx`

**Interfaces:**
- Consumes: existing `PrototypeProps` callbacks and `states.frontDoorLock` / `states.securityMode`.
- Produces: `<nav aria-label="Hjemkontroller">` with `<SceneControls>` as the first child and a single `role="group" aria-label="Hjemmekontroller"` containing eight buttons.

- [ ] **Step 1: Replace the current `BottomControls` return with scene controls followed by one combined home group.**

```tsx
return <nav className="ppf-bottom-controls" aria-label="Hjemkontroller">
  <SceneControls action={props.action} pending={props.pending} errors={props.errors}/>
  <div className="ppf-home-controls" role="group" aria-label="Hjemmekontroller">
    {controls.map(([icon, label, action]) => <button type="button" key={label} onClick={action}><Icon>{icon}</Icon><span>{label}</span></button>)}
    <button type="button" className={locked ? 'is-active' : ''} onClick={() => props.action(locked ? 'unlockDoor' : 'lockDoor')}>
      <Icon>{locked ? 'lock' : 'lock_open'}</Icon><span>{locked ? 'Låst' : 'Lås døren'}</span>
    </button>
    <button type="button" className={securityOn ? 'is-active' : ''} onClick={() => props.action('securityMode')}>
      <Icon>shield</Icon><span>{securityOn ? 'Overvåket' : 'Start overvåking'}</span>
    </button>
  </div>
</nav>;
```

- [ ] **Step 2: Delete the now-unused `ppf-safety-controls` JSX wrapper only; retain the state calculations and callbacks unchanged.**

- [ ] **Step 3: Run the targeted test and confirm it passes.**

Run: `npm.cmd test -- MainDashboardPrototype.test.tsx`

Expected: PASS, including the existing scene confirmation test and the two new grouping tests.

- [ ] **Step 4: Commit the component change.**

```powershell
git add src/client/MainDashboardPrototype.tsx src/client/MainDashboardPrototype.test.tsx
git commit -m "feat: combine safety controls with home controls"
```

### Task 3: Apply the approved desktop and responsive layout

**Files:**
- Modify: `src/client/styles.css:973-1009`
- Test: `src/client/MainDashboardPrototype.test.tsx`

**Interfaces:**
- Consumes: `ppf-bottom-controls`, `ppf-scene-controls`, and `ppf-home-controls` emitted by Task 2.
- Produces: standalone scene controls aligned to the left and one mathematically centered eight-button home group on desktop; stacked usable groups on narrow screens.

- [ ] **Step 1: Replace the desktop bottom-bar placement rules with a three-column grid.**

```css
.ppf-bottom-controls{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
  align-items:center;
  gap:10px;
  padding:0;
  border:0;
  background:transparent;
  box-shadow:none;
  backdrop-filter:none;
}
.ppf-scene-controls{grid-column:1;justify-self:end;flex:none}
.ppf-home-controls{grid-column:2;grid-template-columns:repeat(8,minmax(64px,1fr));width:auto;min-width:512px;flex:none}
.ppf-bottom-controls .ppf-home-controls button{min-width:64px;min-height:55px}
```

- [ ] **Step 2: Remove only the obsolete `.ppf-safety-controls` rules in this bottom-control section.**

- [ ] **Step 3: Update the narrow-screen media query to use two rows without clipping.**

```css
@media(max-width:700px){
  .ppf-bottom-controls{display:grid;grid-template-columns:1fr;gap:5px;padding:4px 3px 8px;background:#121c19}
  .ppf-scene-controls,.ppf-home-controls{grid-column:1;width:100%;min-width:0}
  .ppf-scene-controls{grid-row:1;justify-self:stretch}
  .ppf-home-controls{grid-row:2;grid-template-columns:repeat(8,minmax(0,1fr))}
  .ppf-bottom-controls .ppf-home-controls button{min-width:0;min-height:58px;padding-inline:1px}
}
```

- [ ] **Step 4: Run the targeted test file.**

Run: `npm.cmd test -- MainDashboardPrototype.test.tsx`

Expected: PASS.

- [ ] **Step 5: Manually verify the local dashboard at `http://127.0.0.1:5173/`.**

Check desktop and a 700 px viewport: scenes are isolated and left on desktop; the combined group is centered; Modus opens the existing Full/Gjest/Barn dialog; lock and security remain operable; no controls are clipped.

- [ ] **Step 6: Commit the styling change.**

```powershell
git add src/client/styles.css
git commit -m "style: center grouped bottom controls"
```

### Task 4: Full verification and release-ready review

**Files:**
- Modify: none expected

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified local implementation suitable for the repository’s standard V2 release workflow if deployment is subsequently requested.

- [ ] **Step 1: Run all tests.**

Run: `npm.cmd test`

Expected: PASS with no failing suites.

- [ ] **Step 2: Build the dashboard.**

Run: `npm.cmd run build`

Expected: TypeScript check and Vite build both exit 0.

- [ ] **Step 3: Check whitespace and accidental generated changes.**

Run: `git diff --check; git status --short`

Expected: no `git diff --check` output; only the planned source, test, spec, and plan files are modified.

- [ ] **Step 4: Commit the documentation if it is not already committed.**

```powershell
git add docs/specs/2026-09-18-bottom-control-grouping.md docs/superpowers/plans/2026-09-18-bottom-control-grouping.md
git commit -m "docs: plan bottom control grouping"
```

- [ ] **Step 5: Do not push or deploy unless explicitly requested.**

If a V2 release is requested afterward, confirm the branch and remote, push the verified `codex/dashboard-prototype-v2` branch, then follow the repository’s V2 Portainer release procedure.

## Self-Review

- **Spec coverage:** Task 1 covers grouping, mode callback, and safety behavior; Task 2 implements the DOM hierarchy; Task 3 implements desktop and responsive visual requirements; Task 4 verifies all acceptance criteria.
- **Placeholder scan:** No unfilled work markers or unspecified test steps remain.
- **Type consistency:** The plan uses only existing callbacks and action keys from `PrototypeProps` and `DashboardAction`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-18-bottom-control-grouping.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** — execute this plan in the current session with review checkpoints.