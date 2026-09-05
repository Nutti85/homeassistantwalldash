# Structured Klara AI Briefing Implementation Plan

> **For agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the prose-first Klara AI presentation with a consistent, glanceable briefing built from real Home Assistant current and forecast values while preserving the current Klara styling and full AI text.

**Architecture:** Add a pure client-side briefing model that maps an AI report mode plus the existing Home Assistant state snapshot into a stable period, five ordered metrics, and six ordered practical cards. Both the compact dashboard card and modal consume this model. The existing Markdown parser remains only for the collapsed details view, so no server, n8n, API-contract, or entity configuration changes are required.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, existing CSS and Material Symbols

**Spec:** `docs/superpowers/specs/2026-09-04-structured-ai-briefing-design.md`

---

## File map

- Create: `src/client/briefingModel.ts` — period selection, formatting, metrics, clothing, practical-card view model.
- Create: `src/client/briefingModel.test.ts` — deterministic tests for all report modes, rounding, actual/future source selection, empty states, and stale alerts.
- Create: `src/client/BriefingOverview.tsx` — shared structured rendering for modal and compact card.
- Modify: `src/client/App.tsx` — pass `states`, replace modal/card prose-first bodies, retain collapsed report details and existing controls.
- Modify: `src/client/App.test.tsx` — integration and accessibility coverage for the modal and compact card.
- Modify: `src/client/styles.css` — new internal layout using existing Klara colors, border radii, typography, and responsive breakpoints.
- Modify: `README.md` — document the structured display semantics and data-source distinction.

### Task 1: Define the briefing view-model contract and period rules

**Files:**

- Create: `src/client/briefingModel.ts`
- Create: `src/client/briefingModel.test.ts`

- [ ] **Step 1: Write failing tests for fixed ordering and all report periods**

Use fixed `publishedAt` values with explicit Oslo offsets. Assert both the machine interval and the human label, including the deliberate 15:00–16:00 gap.

```ts
import { describe, expect, it } from 'vitest';
import { briefingPeriod, buildBriefingViewModel } from './briefingModel';

describe('briefing periods', () => {
  const osloTime = (value: string) => new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));

  it.each([
    ['morning', '06:00', '09:00', 'Morgen · 06:00–09:00'],
    ['midday', '09:00', '15:00', 'Formiddag · 09:00–15:00'],
    ['afternoon', '16:00', '19:00', 'Ettermiddag · 16:00–19:00'],
    ['evening', '19:00', '23:00', 'Kveld · 19:00–23:00'],
  ] as const)('maps %s to its fixed Oslo interval', (mode, start, end, label) => {
    const period = briefingPeriod(mode, '2026-09-04T22:00:00+02:00');
    expect(period.label).toBe(label);
    expect(osloTime(period.startAt)).toBe(start);
    expect(osloTime(period.endAt)).toBe(end);
  });

  it('uses the 24 hours after publication for a full report', () => {
    const period = briefingPeriod('full', '2026-09-04T22:00:00+02:00');
    expect(Date.parse(period.endAt) - Date.parse(period.startAt)).toBe(24 * 60 * 60 * 1000);
    expect(period.label).toMatch(/^Neste 24 timer/);
  });
});

it('always returns the approved metric and practical order', () => {
  const model = buildBriefingViewModel(report, states, new Date('2026-09-04T22:05:00+02:00'));
  expect(model.metrics.map(({ id }) => id)).toEqual(['weather', 'temperature', 'wind', 'rain', 'clothing']);
  expect(model.practical.map(({ id }) => id)).toEqual(['calendar', 'travel', 'school', 'kindergarten', 'home', 'warnings']);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm.cmd test -- src/client/briefingModel.test.ts`

Expected: FAIL because `briefingModel.ts` does not exist.

- [ ] **Step 3: Implement the exported types and Oslo-time period helper**

Start with this explicit contract; keep rendering concerns out of the model.

```ts
export type BriefingMetricId = 'weather' | 'temperature' | 'wind' | 'rain' | 'clothing';
export type BriefingPracticalId = 'calendar' | 'travel' | 'school' | 'kindergarten' | 'home' | 'warnings';
export type BriefingTone = 'default' | 'positive' | 'notice' | 'warning' | 'muted';

export interface BriefingItem<Id extends string> {
  id: Id;
  label: string;
  icon: string;
  value: string;
  context: string;
  tone: BriefingTone;
}

export interface BriefingPeriod {
  startAt: string;
  endAt: string;
  label: string;
  source: 'current-and-forecast' | 'forecast';
}

export interface BriefingViewModel {
  period: BriefingPeriod;
  metrics: BriefingItem<BriefingMetricId>[];
  practical: BriefingItem<BriefingPracticalId>[];
}
```

Implement `briefingPeriod(mode, publishedAt)` and `forecastPointsInPeriod(...)`. Treat the end as exclusive. For `full`, use `publishedAt` through 24 hours later and produce a label with both weekday/time endpoints. Use `Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo' })`; do not rely on the test machine's local timezone.

- [ ] **Step 4: Run the focused test**

Run: `npm.cmd test -- src/client/briefingModel.test.ts`

Expected: PASS for period and order tests.

- [ ] **Step 5: Commit the period contract**

```powershell
git add src/client/briefingModel.ts src/client/briefingModel.test.ts
git commit -m "feat: define structured briefing model"
```

### Task 2: Calculate the five weather and clothing metrics

**Files:**

- Modify: `src/client/briefingModel.ts`
- Modify: `src/client/briefingModel.test.ts`

- [ ] **Step 1: Add failing tests using realistic sensor and forecast values**

Build one full-report fixture with current outdoor temperature `12.7`, Netatmo wind `0.0`, gust `0.56`, rain now `0`, rain today `8.3`, and hourly points spanning the next 24 hours. Assert:

```ts
expect(model.metrics[1]).toMatchObject({
  id: 'temperature',
  value: '12,5 °C',
  context: expect.stringContaining('11,0–17,5 °C'),
});
expect(model.metrics[2]).toMatchObject({
  id: 'wind',
  value: '0 m/s',
  context: expect.stringContaining('kast opptil 6 m/s'),
});
expect(model.metrics[3]).toMatchObject({
  id: 'rain',
  value: '0 mm',
  context: expect.stringContaining('8,3 mm i dag'),
});
```

Add separate future-morning assertions proving that current Netatmo readings are ignored and only 06:00–09:00 forecast points are used. Add boundary cases for `12.24 -> 12,0`, `12.25 -> 12,5`, `12.74 -> 12,5`, `12.75 -> 13,0`, and whole-number wind rounding.

- [ ] **Step 2: Run the focused tests and confirm the metric assertions fail**

Run: `npm.cmd test -- src/client/briefingModel.test.ts`

Expected: FAIL because metric calculation is not implemented.

- [ ] **Step 3: Implement numeric formatting and source-aware aggregation**

Add small pure helpers:

```ts
export const roundTemperature = (value: number): number => Math.round(value * 2) / 2;
export const roundWind = (value: number): number => Math.round(value);

const formatTemperature = (value: number) =>
  `${roundTemperature(value).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`;

const formatRain = (value: number) =>
  value === 0 ? '0 mm' : `${value.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`;
```

Use `forecastPoints(states.weatherHourly)`, `conditionLabel`, `conditionIcon`, `currentTemperatureNumber`, and `stateValue` from `dashboardModel.ts`. Current values are allowed only when `now` falls inside the report period; otherwise aggregate the selected hourly points. Mark an interval `Delvis prognose` when the hourly series does not cover both boundaries.

- [ ] **Step 4: Implement deterministic clothing advice and test threshold edges**

Implement `clothingAdvice(points)` with the exact thresholds in the spec. Return an icon, primary recommendation, and optional additions. Add tests at 5, 12, and 18 °C, plus rain probability 40%, precipitation 0.2 mm, and gust 10 m/s.

- [ ] **Step 5: Run the model tests**

Run: `npm.cmd test -- src/client/briefingModel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the metric calculations**

```powershell
git add src/client/briefingModel.ts src/client/briefingModel.test.ts
git commit -m "feat: derive briefing weather and clothing metrics"
```

### Task 3: Build the six fixed practical cards

**Files:**

- Modify: `src/client/briefingModel.ts`
- Modify: `src/client/briefingModel.test.ts`
- Modify: `src/client/dashboardModel.ts`
- Modify: `src/client/dashboardModel.test.ts`
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Write failing tests for real, empty, and unavailable states**

Cover these exact distinctions:

- calendar source exists with no period event -> `Ingen avtaler i perioden`, with the next real event in context;
- travel sensor missing/unavailable -> named `Ikke tilgjengelig` row, not a missing card;
- school/MyKid source exists but has no matching item -> `Ingen skole denne perioden` / `Ingen plan denne perioden`;
- school/MyKid source unavailable -> `Ikke tilgjengelig`;
- locked front door plus security raw state `2` -> `Låst` and `Notifikasjoner`;
- stale meteo alert ending before the period -> `Ingen varsler`;
- future alert overlapping the period -> alert title and severity.

Use the real shape accepted by `calendarEvents`, `jacobWeeklyPlan`, and `mykidKindergarten` rather than test-only shorthand.

- [ ] **Step 2: Run tests and confirm practical-card assertions fail**

Run: `npm.cmd test -- src/client/briefingModel.test.ts src/client/dashboardModel.test.ts`

Expected: FAIL on the new practical and alert cases.

- [ ] **Step 3: Extract reusable meteo parsing from `App.tsx`**

Move the pure `MeteoAlert` type and these helpers from `App.tsx` to `dashboardModel.ts`: `meteoAlarmSeverity`, `attrText`, `attrEvents`, `isoTimes`, `parseMeteoAlert`, and `meteoAlarmEntries`. Add period-overlap filtering:

```ts
export const meteoAlarmEntries = (
  state: HomeAssistantState | undefined,
  period?: { startAt: string; endAt: string },
  now = new Date(),
): MeteoAlert[] => parsedAlerts.filter((alert) => {
  if (!period) return !alert.endsAt || Date.parse(alert.endsAt) >= now.getTime();
  const starts = alert.startsAt ? Date.parse(alert.startsAt) : Number.NEGATIVE_INFINITY;
  const ends = alert.endsAt ? Date.parse(alert.endsAt) : Number.POSITIVE_INFINITY;
  return starts < Date.parse(period.endAt) && ends >= Date.parse(period.startAt);
});
```

Update `WeatherAlerts` to import and use the shared helper. This fixes the stale-warning issue in both the existing weather card and the new briefing.

- [ ] **Step 4: Implement the practical-card builders**

Compose the existing model helpers rather than parsing AI Markdown. Keep the returned array literal in approved order so missing values cannot reorder cards:

```ts
const practical: BriefingViewModel['practical'] = [
  calendarBriefing(states.calendar, period),
  travelBriefing(states.andreasTravelTime, states.hegeTravelTime),
  schoolBriefing(jacobWeeklyPlan(states.jacobWeeklyPlan), period),
  kindergartenBriefing(mykidKindergarten(states.mykidKindergarten), period),
  homeBriefing(states.frontDoorLock, states.securityMode),
  warningBriefing(states, period),
];
```

Limit visible card content to two short lines. Put additional content in the existing detailed report disclosure, not extra grid rows.

- [ ] **Step 5: Run model tests**

Run: `npm.cmd test -- src/client/briefingModel.test.ts src/client/dashboardModel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit practical data mapping**

```powershell
git add src/client/briefingModel.ts src/client/briefingModel.test.ts src/client/dashboardModel.ts src/client/dashboardModel.test.ts src/client/App.tsx
git commit -m "feat: map practical briefing data"
```

### Task 4: Render one shared structured overview

**Files:**

- Create: `src/client/BriefingOverview.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`

- [ ] **Step 1: Replace old prose expectations with failing structured-view assertions**

Update the main Klara integration test to supply realistic `weatherHourly`, current sensor, calendar, school, MyKid, home, travel, and alert states. Assert the period first, then exact order:

```ts
const dialog = await screen.findByRole('dialog', { name: 'Kveldsbriefing' });
expect(within(dialog).getByText('Kveld · 19:00–23:00')).toBeInTheDocument();
expect(within(dialog).getAllByTestId('briefing-metric').map((node) => node.dataset.metric)).toEqual([
  'weather', 'temperature', 'wind', 'rain', 'clothing',
]);
expect(within(dialog).getAllByTestId('briefing-practical').map((node) => node.dataset.practical)).toEqual([
  'calendar', 'travel', 'school', 'kindergarten', 'home', 'warnings',
]);
```

Assert that the report sentence is initially hidden, becomes visible after `Vis detaljer`, and the five report-selector buttons retain their existing `aria-pressed` behavior.

- [ ] **Step 2: Run the App test and confirm failure**

Run: `npm.cmd test -- src/client/App.test.tsx`

Expected: FAIL because the structured component is not rendered.

- [ ] **Step 3: Create `BriefingOverview`**

Use a single component for both surfaces:

```tsx
export function BriefingOverview({ model, compact = false }: {
  model: BriefingViewModel;
  compact?: boolean;
}) {
  return <div className={`briefing-overview${compact ? ' is-compact' : ''}`}>
    <p className="briefing-period"><span className="material-symbols-outlined" aria-hidden="true">schedule</span>{model.period.label}</p>
    <div className="briefing-metrics" aria-label="Vær og klær">
      {model.metrics.map((item) => <BriefingMetric key={item.id} item={item}/>)}
    </div>
    {!compact && <div className="briefing-practical-grid" aria-label="Praktisk oversikt">
      {model.practical.map((item) => <BriefingPractical key={item.id} item={item}/>)}
    </div>}
  </div>;
}
```

Use semantic headings in the practical cards. Mark duplicate decorative icons `aria-hidden="true"`; visible labels and values must carry the meaning.

- [ ] **Step 4: Wire the model into both Klara surfaces**

Change `KlaraAiModal` to accept `states` and create one model using `report`, `states`, and the current time. Replace the existing visible summary/section body with `<BriefingOverview model={model}/>` and add:

```tsx
<details className="klara-ai-details">
  <summary>Vis detaljer</summary>
  <div className="klara-ai-sections">{/* existing parsed report sections */}</div>
</details>
```

Change `BriefingCard` to accept `states` and render `<BriefingOverview model={model} compact/>`. Update `metricCards` and the modal call site to pass the existing `states` object. Do not alter report polling, refresh progress, auto-open, focus restoration, or footer controls.

- [ ] **Step 5: Run App tests**

Run: `npm.cmd test -- src/client/App.test.tsx`

Expected: PASS after updating obsolete prose-first assertions; existing loading, refresh, focus, and mode tests remain green.

- [ ] **Step 6: Commit shared rendering**

```powershell
git add src/client/BriefingOverview.tsx src/client/App.tsx src/client/App.test.tsx
git commit -m "feat: render structured Klara briefings"
```

### Task 5: Match the approved Klara visual language responsively

**Files:**

- Modify: `src/client/styles.css`
- Modify: `src/client/App.test.tsx`

- [ ] **Step 1: Add a DOM guard for the stable grids**

Add assertions that all eleven cards remain rendered when every source is unavailable and that the practical cards still follow the approved order. This protects the CSS layout from being coupled to conditional rendering.

- [ ] **Step 2: Add styles under the existing Klara AI section**

Reuse the current background, border, peach, mint, and typography values. Add only internal layout classes:

```css
.briefing-period { display:flex; align-items:center; gap:8px; }
.briefing-metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
.briefing-metric { min-width:0; text-align:center; border:1px solid rgba(255,255,255,.08); border-radius:16px; }
.briefing-metric-icon { font-size:42px; color:var(--klara-accent, #f0b397); }
.briefing-practical-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.klara-ai-details > summary { cursor:pointer; }
```

Prefer existing custom properties where present; do not introduce a parallel Klara palette. Keep the current modal dimensions, header, meta row, backdrop, footer, and selector styles.

- [ ] **Step 3: Add narrow-screen rules without changing order**

At the existing mobile breakpoint, make metrics a two-column grid or ordered horizontal strip and practical cards one column. Ensure long calendar titles wrap, values do not overlap, the details disclosure scrolls with the body, and the sticky footer remains reachable.

- [ ] **Step 4: Verify interaction and accessibility manually in local development**

Run: `npm.cmd run dev`

Open: `http://127.0.0.1:5173`

Check regular width and a narrow viewport for:

- period visible before metrics;
- five metrics in fixed order;
- calendar always upper-left in the practical grid;
- readable Norwegian numeric formatting;
- clothing icon and recommendation;
- `Vis detaljer` keyboard operation;
- loading, refreshing, error, empty, and unavailable states;
- no footer overlap or horizontal page scroll.

- [ ] **Step 5: Commit styling**

```powershell
git add src/client/styles.css src/client/App.test.tsx
git commit -m "style: align structured briefings with Klara AI"
```

### Task 6: Document semantics and perform final verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Document the UI behavior**

In `README.md` under `n8n AI-rapport`, explain that the visible metric cards come from the current Home Assistant snapshot and selected hourly forecast interval, while n8n Markdown remains under `Vis detaljer`. Record the 0.5 °C and whole-m/s rounding, fixed category order, explicit unavailable states, and stale-alert filtering.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 3: Run production build validation**

Run: `npm.cmd run build`

Expected: TypeScript completes without errors and Vite produces the production bundle.

- [ ] **Step 4: Review the final diff for scope and regressions**

Run:

```powershell
git diff --check
git status --short
git diff -- src/client/briefingModel.ts src/client/BriefingOverview.tsx src/client/App.tsx src/client/styles.css src/client/App.test.tsx src/client/dashboardModel.ts src/client/dashboardModel.test.ts README.md
```

Confirm that there are no server, n8n, Home Assistant entity, scheduling, or Portainer changes, and that unrelated pre-existing untracked files are untouched.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md
git commit -m "docs: explain structured Klara briefing data"
```

## Completion checklist

- [ ] All five report modes show an explicit period before any values.
- [ ] Temperature is rounded to 0.5 °C and wind/gust to whole m/s.
- [ ] Five metric cards and six practical cards keep their approved order.
- [ ] Calendar remains the first practical card in every report and empty state.
- [ ] Clothing is icon-led and derived from the selected weather interval.
- [ ] Current readings and future forecast values cannot be confused.
- [ ] Expired meteo alerts are absent.
- [ ] Full AI prose is available only after `Vis detaljer` is opened.
- [ ] Existing Klara shell, report controls, polling, and focus behavior are unchanged.
- [ ] `npm.cmd test`, `npm.cmd run build`, and `git diff --check` pass.
