# Jacob weekly-plan carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatically rotating Calendar/Jacob school-plan card and publish a full normalized Jacob weekly-plan snapshot from Klara PostgreSQL to Home Assistant through n8n.

**Architecture:** Home Assistant remains the dashboard’s only dynamic-data boundary. A new `sensor.jacob_weekly_plan` state is requested by the backend; pure frontend parsing renders a compact projection of its structured attributes. A separate n8n workflow reads the latest Jacob plan rows, normalizes them in one Code node, and writes the state snapshot to Home Assistant.

**Tech Stack:** TypeScript, React 18, Vitest, Testing Library, Express/Home Assistant REST client, n8n PostgreSQL and HTTP Request nodes.

**Spec:** `docs/superpowers/specs/2026-08-25-jacob-weekly-plan-carousel-design.md`

## Global Constraints

- Keep the existing calendar slot and waste collection rendering intact on slide 1.
- Default the entity to `sensor.jacob_weekly_plan`; allow `HA_JACOB_WEEKLY_PLAN_ENTITY_ID` to override it.
- Automatic rotation is 30 seconds; pause while the document is hidden; manual switching resets the timer.
- Keep all human-readable n8n output in Norwegian and machine-readable dates in ISO format.
- Never commit database passwords, Home Assistant tokens, or PDF/source text.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Define and test the weekly-plan attribute parser

**Files:**
- Modify: `src/client/dashboardModel.ts`
- Create: `src/client/weeklyPlan.test.ts`
- Modify: `src/shared/entities.ts`

**Interfaces:**
- Produces `JacobWeeklyPlanSnapshot`, `JacobPlanItem`, and `jacobWeeklyPlan(state: HomeAssistantState | undefined): JacobWeeklyPlanSnapshot | undefined`.
- `jacobWeeklyPlan` accepts malformed/missing Home Assistant attributes and returns `undefined` only when the whole entity is unavailable; malformed collections become empty arrays.

- [ ] **Step 1: Write the failing parser tests**

```ts
it('parses the full structured snapshot while preserving readable fields', () => {
  const result = jacobWeeklyPlan(state('sensor.jacob_weekly_plan', 'Denne uken', {
    summary: 'Jacob har prøve og fotball denne uken.',
    week_start: '2026-08-24',
    events: [{ date: '2026-08-25', weekday: 'tirsdag', time: '16:00', title: 'Fotball', details: 'Kunstgress' }],
    reminders: [{ weekday: 'fredag', title: 'Ta med innesko' }],
    homework: [{ subject: 'Matte', title: 'Lekse side 12' }],
    school_schedule: [{ weekday: 'mandag', title: 'Skole' }],
    topics: ['Brøk'], messages: ['Husk gymtøy'],
  }));
  expect(result).toMatchObject({ summary: 'Jacob har prøve og fotball denne uken.', events: [{ title: 'Fotball' }], reminders: [{ title: 'Ta med innesko' }], homework: [{ subject: 'Matte' }], topics: ['Brøk'] });
});

it('returns an empty safe snapshot for malformed collections', () => {
  expect(jacobWeeklyPlan(state('sensor.jacob_weekly_plan', 'Ukjent', { summary: 42, events: 'bad', reminders: null }))).toMatchObject({ summary: '', events: [], reminders: [], homework: [], school_schedule: [], topics: [], messages: [] });
});

it('returns undefined for an unavailable entity', () => {
  expect(jacobWeeklyPlan(state('sensor.jacob_weekly_plan', 'unavailable'))).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and verify the expected RED failure**

Run: `npm.cmd test -- src/client/weeklyPlan.test.ts`

Expected: FAIL because the snapshot type/helper is not defined yet.

- [ ] **Step 3: Add the shared types and minimal parser**

Add the exact item/snapshot types from the spec to `src/shared/entities.ts`. In `dashboardModel.ts`, validate `stateValue`, copy only string/number plan scalars, accept only arrays of objects for item collections, and map each item to safe string fields. Do not throw from parsing.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- src/client/weeklyPlan.test.ts`

Expected: all parser tests pass.

- [ ] **Step 5: Commit the parser unit**

```text
git add src/shared/entities.ts src/client/dashboardModel.ts src/client/weeklyPlan.test.ts
git commit -m "feat: parse Jacob weekly plan state"
```

### Task 2: Request the weekly-plan entity from the backend

**Files:**
- Modify: `src/shared/entities.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/homeAssistant.ts` only if its state-key filtering requires an explicit mapping
- Modify: `src/server/app.test.ts` or `src/server/homeAssistant.test.ts`

**Interfaces:**
- Adds state key `jacobWeeklyPlan` to `DashboardStateKey` and `defaultDashboardEntityIds`.
- `entities.jacobWeeklyPlan` resolves from `HA_JACOB_WEEKLY_PLAN_ENTITY_ID` or the default.

- [ ] **Step 1: Write the failing backend assertion**

Extend the existing state-fetch test fixture with a `jacobWeeklyPlan` entity and assert the Home Assistant request includes `sensor.jacob_weekly_plan` under the resolved entity IDs. Add an override test asserting `HA_JACOB_WEEKLY_PLAN_ENTITY_ID` is used by the server configuration path.

- [ ] **Step 2: Run the focused server tests and verify RED**

Run: `npm.cmd test -- src/server/homeAssistant.test.ts src/server/app.test.ts`

Expected: FAIL because the new key is not part of the entity map/request list.

- [ ] **Step 3: Implement the entity mapping**

Add the key/default and environment override following the calendar and room-climate patterns. Keep the Home Assistant client’s existing empty-entity filtering and retry behavior unchanged.

- [ ] **Step 4: Run the focused server tests and verify GREEN**

Run: `npm.cmd test -- src/server/homeAssistant.test.ts src/server/app.test.ts`

Expected: all focused server tests pass.

- [ ] **Step 5: Commit the backend contract**

```text
git add src/shared/entities.ts src/server/index.ts src/server/homeAssistant.ts src/server/homeAssistant.test.ts src/server/app.test.ts
git commit -m "feat: expose Jacob weekly plan state"
```

### Task 3: Create the n8n publishing workflow contract

**Files:**
- Create: `src/shared/weeklyPlanFormatter.ts`
- Create: `src/shared/weeklyPlanFormatter.test.ts`
- Create: `docs/n8n-jacob-weekly-plan-publish.md`
- Create: `n8n/klara-publish-jacob-weekly-plan.json`

**Interfaces:**
- PostgreSQL input node returns the latest `weekly_plans` row for `people.external_key = 'jacob'`, plus child arrays keyed by `plan_id`.
- Code node produces `{ state: string, attributes: JacobWeeklyPlanSnapshot }`.
- Home Assistant request writes `POST /api/states/sensor.jacob_weekly_plan` with the Code node output.

- [ ] **Step 1: Write a fixture-level formatter test**

Create `formatJacobWeeklyPlan(input: WeeklyPlanDatabaseRows): { state: string; attributes: JacobWeeklyPlanSnapshot }` in `src/shared/weeklyPlanFormatter.ts` and test that representative database rows produce sorted events/reminders, empty arrays for missing children, ISO date fields, and a Norwegian summary. The expected output must include `homework`, `school_schedule`, `topics`, and `messages` even though the dashboard only renders the first three display fields. The n8n Code node will contain the same pure logic inline because n8n imports the node source as part of the workflow JSON.

- [ ] **Step 2: Run the fixture test and verify RED**

Run the new focused test command. Expected: FAIL because no workflow formatter exists yet.

- [ ] **Step 3: Create the importable workflow JSON**

Use a Manual Trigger and a Schedule Trigger (every 15 minutes) feeding a PostgreSQL query node (latest Jacob plan plus related rows), a Code node implementing the normalization contract, and an HTTP Request node targeting the Home Assistant state API. Use credential reference placeholders and a fixed default entity ID without any secret values.

- [ ] **Step 4: Document setup and validation**

Document the SQL result shape, required n8n credential names, Home Assistant endpoint, attribute contract, import steps, and a rerun check proving the workflow is read/publish-only and does not duplicate Klara database rows. Explicitly state that the PDF remains in Klara storage.

- [ ] **Step 5: Validate the workflow artifact**

Run: `node -e "JSON.parse(require('fs').readFileSync('n8n/klara-publish-jacob-weekly-plan.json','utf8')); console.log('valid JSON')"`

Expected: `valid JSON`, with no token/password-like values present in the file.

### Task 4: Add the carousel shell and weekly-plan card

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles.css`
- Modify: `src/client/App.test.tsx`

**Interfaces:**
- `CalendarPlanCarousel({ states, wasteDays, wasteTypes })` owns slide index, timer, visibility listener, pointer gesture handling, and both slide renderers.
- `JacobWeeklyPlanCard({ plan })` renders only the compact projection: summary, events, and reminders.

- [ ] **Step 1: Write failing component tests**

Add tests covering the initial Calendar slide, two accessible dot buttons with the first selected, manual dot switching, the weekly-plan summary/events/reminders, empty-state rendering, and automatic rotation with fake timers:

```tsx
it('rotates from calendar to Jacob school plan after 30 seconds', async () => {
  vi.useFakeTimers();
  render(<App api={createApi({ jacobWeeklyPlan: state('sensor.jacob_weekly_plan', 'Denne uken', { summary: 'Prøve på tirsdag.', events: [], reminders: [] }) })} />);
  expect(screen.getByRole('button', { name: 'Vis kalender' })).toHaveAttribute('aria-current', 'true');
  await act(async () => { vi.advanceTimersByTime(30_000); });
  expect(screen.getByRole('button', { name: 'Vis Jacobs skoleplan' })).toHaveAttribute('aria-current', 'true');
  vi.useRealTimers();
});
```

Also assert that a `visibilitychange` event while `document.hidden` is true does not advance the slide and that a manual switch restarts the interval.

- [ ] **Step 2: Run the focused component tests and verify RED**

Run: `npm.cmd test -- src/client/App.test.tsx`

Expected: FAIL because the new carousel controls/content do not exist.

- [ ] **Step 3: Implement the minimal carousel behavior**

Replace the direct calendar content in the regular dashboard layout item with `CalendarPlanCarousel`. Use a `useEffect` interval of 30,000 ms, a `visibilitychange` listener that clears/restarts the interval, and pointer down/up coordinates to detect horizontal swipes without preventing normal vertical scrolling. Reset slide index to `0` when regular mode is entered. Keep the existing calendar and waste JSX inside slide 1.

- [ ] **Step 4: Add the card markup and styles**

Add a shared card header with title and indicator buttons, a fixed-height/min-height content region with `overflow: hidden`, plan sections with compact Norwegian labels, visible focus styles, `touch-action: pan-y`, and a `@media (prefers-reduced-motion: reduce)` override that removes slide transitions. Keep both dots in the top-right and ensure the content cannot force neighboring grid cards to move.

- [ ] **Step 5: Run component tests and verify GREEN**

Run: `npm.cmd test -- src/client/App.test.tsx`

Expected: all existing and new component tests pass.

- [ ] **Step 6: Commit the carousel**

```text
git add src/client/App.tsx src/client/styles.css src/client/App.test.tsx
git commit -m "feat: add Jacob weekly plan carousel"
```

### Task 5: Full verification and handoff

**Files:**
- Modify only files required by verification fixes.

- [ ] **Step 1: Run the complete test suite**

Run: `npm.cmd test`

Expected: Vitest exits 0 with zero failed tests.

- [ ] **Step 2: Run the production build**

Run: `npm.cmd run build`

Expected: TypeScript and Vite both exit 0.

- [ ] **Step 3: Validate the workflow and inspect the diff**

Run: `node -e "JSON.parse(require('fs').readFileSync('n8n/klara-publish-jacob-weekly-plan.json','utf8')); console.log('workflow JSON valid')"` and `git diff --check`.

Expected: valid workflow JSON, no whitespace errors, and no accidental changes to unrelated dirty files.

- [ ] **Step 4: Run the local dashboard smoke check**

Run: `npm.cmd run dev` using the repository’s fixed ports, then verify `http://127.0.0.1:3000/health` and `http://127.0.0.1:5173` according to `AGENTS.md`. Do not deploy Portainer or mutate production without a separate explicit request.

- [ ] **Step 5: Report evidence**

Report the exact test/build results, the workflow artifact path, the Home Assistant entity contract, and any setup action still required in n8n (credential selection, database query adaptation, or activation schedule).
