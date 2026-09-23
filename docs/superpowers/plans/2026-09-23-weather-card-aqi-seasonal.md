# Weather Card AQI and Seasonal Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default V2 weather card with the selected J composition, live US AQI, seasonal pollen/fallback content, and a readable rain-first measurement rail.

**Architecture:** Keep the existing Home Assistant `/api/states` flow for weather and pollen. Add a small server-owned Open-Meteo AQI service behind a separate same-origin endpoint, so AQI outages never disrupt the dashboard state poll. Build V2-only view-model helpers and a focused card component; leave the V1 overview and detailed weather view intact except for source attribution.

**Tech Stack:** React 18, TypeScript, Express 5, Vitest, Testing Library, existing CSS/Material Symbols.

**Spec:** `docs/superpowers/specs/2026-09-23-weather-card-aqi-seasonal-design.md`

## Global Constraints

- Preserve the existing Walldash visual language and `docs/dashboard-redesign/IMPLEMENTATION_BRIEF.md` accessibility/layout rules.
- No hardcoded weather, AQI, pollen, or warning numbers in rendered application code.
- Keep HA credentials server-side. Use Open-Meteo only from the server with coarse coordinates.
- Keep V1 weather and detailed weather navigation working; V2 default receives the J card.
- Work locally; do not push, release, deploy, or touch Portainer.
- Before execution, check the current branch/worktree and incorporate relevant integrated commits if needed. Use a dedicated worktree if another task is actively changing this checkout.

---

## File map and task order

| File | Responsibility |
| --- | --- |
| `src/server/airQuality.ts` + test | Fetch, validate, cache, and classify Open-Meteo US AQI. |
| `src/server/app.ts`, `index.ts`, `app.test.ts`, `.env.example` | Serve same-origin AQI endpoint and wire optional coordinates. |
| `src/client/weatherCardModel.ts` + test | Pure selection and formatting of the existing HA weather/pollen/alert/sun data. |
| `src/client/V2WeatherCard.tsx` + test | J card markup, accessible status text, AQI polling, navigation. |
| `src/client/MainDashboardPrototype.tsx` + test, `src/client/styles.css` | Use the J card in the default V2 slot and fit it in the dashboard. |
| `src/client/App.tsx` | Add subdued Open-Meteo/CAMS attribution to detailed weather. |

### Task 1: Server-side AQI source and endpoint

**Files:**
- Create: `src/server/airQuality.ts`, `src/server/airQuality.test.ts`
- Modify: `src/server/app.ts`, `src/server/app.test.ts`, `src/server/index.ts`, `.env.example`

**Interfaces:**
- Produce `AirQualityReading = { value: number; category: 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very-unhealthy' | 'hazardous'; observedAt: string; source: 'open-meteo' }`.
- Produce `AirQualityService` with `getCurrent(): Promise<AirQualityReading | null>` and constructor options `{ latitude: number; longitude: number; fetcher?: typeof fetch; now?: () => number }`.
- `AppServices.airQuality?: Pick<AirQualityService, 'getCurrent'>`; `GET /api/air-quality` returns the reading or `{ value: null }` with HTTP 200, including when the upstream is unavailable. Use `Cache-Control: private, max-age=60`.

- [ ] **Step 1: Write failing service tests.** Cover `us_aqi=42`→`good`, category boundaries 50/51/100/101/150/151/200/201/300/301/500, malformed/out-of-range input→`null`, 30-minute cache, concurrent calls sharing one fetch, 2-hour stale limit, and network failure→`null`. Mock `fetcher`; never call live Open-Meteo in unit tests.
- [ ] **Step 2: Run `npm.cmd test -- src/server/airQuality.test.ts`.** Expect failure because the service does not yet exist.
- [ ] **Step 3: Implement `AirQualityService`.** Build `https://air-quality-api.open-meteo.com/v1/air-quality` with `URLSearchParams({latitude, longitude, current: 'us_aqi', timezone: 'GMT'})`; validate `current.us_aqi` as finite integer in 0–500 and parse `current.time` as a GMT observation (`${time}Z`), rejecting observations older than two hours. Keep fetch time separately for the 30-minute cache, use `AbortSignal.timeout(5000)`, share an in-flight promise, and return only fresh cached data on errors. Expose a pure `usAqiCategory(value)` helper for the six exact bands.
- [ ] **Step 4: Run `npm.cmd test -- src/server/airQuality.test.ts`.** Expect all service tests to pass.
- [ ] **Step 5: Write failing API tests in `app.test.ts`.** Assert a configured service returns `{ value: 42, category: 'good', observedAt: ..., source: 'open-meteo' }` and an unconfigured/failed service returns `{ value: null }` without changing `/api/states` success.
- [ ] **Step 6: Run `npm.cmd test -- src/server/app.test.ts`.** Expect only new route tests to fail.
- [ ] **Step 7: Wire route and configuration.** In `index.ts`, parse `AQI_LATITUDE`/`AQI_LONGITUDE` as a pair of valid finite coordinates; use defaults `59.1`/`10.2` if both absent; throw on one missing or out-of-range (-90..90, -180..180). Construct the service and pass it to `createApp`. Document both optional variables and coarse defaults in `.env.example`. Avoid logging precise coordinates or raw responses.
- [ ] **Step 8: Run `npm.cmd test -- src/server/airQuality.test.ts src/server/app.test.ts` and `npm.cmd run build`.** Expect both to pass. Commit this server/API slice with `git add .env.example src/server/airQuality.ts src/server/airQuality.test.ts src/server/app.ts src/server/app.test.ts src/server/index.ts` then `git commit -m "feat: serve cached air quality index"`.

### Task 2: Pure weather-card view model

**Files:**
- Create: `src/client/weatherCardModel.ts`, `src/client/weatherCardModel.test.ts`
- Read: `src/client/dashboardModel.ts`, `src/client/App.tsx`, `src/shared/entities.ts`

**Interfaces:**
- Produce `buildV2WeatherCardModel(states: Record<string, HomeAssistantState>, now: Date): V2WeatherCardModel`.
- `V2WeatherCardModel` contains `condition`, `temperature`, `feelsLike`, `temperatureTrend`, `windSpeed`, `windGust`, `windBearing`, `pressure`, `pressureClass`, `pressureTrend`, `humidity`, `rainLastHour`, `rainToday`, and `seasonalSignal`.
- `seasonalSignal` is `{ kind: 'pollen'; species: string; level: number; label: string } | { kind: 'alert'; label: string; detail: string } | { kind: 'frost'; minimum: number } | { kind: 'daylight'; label: string; time: string } | { kind: 'unavailable' }`.

- [ ] **Step 1: Write failing model tests.** Use HA-shaped fixtures for pressure 1020.4→`Høytrykk`, 1008→`Lavtrykk`, 1013→`Normalt trykk`; numeric/string `up`, `down`, `stable`, unknown trends; missing/invalid sensor readings; rain last-hour and today remaining distinct; feels-like from current weather attributes when available. Test pollen level zero and highest-level tie order, plus pollen→alert→overnight frost→next sun event→unavailable priority.
- [ ] **Step 2: Run `npm.cmd test -- src/client/weatherCardModel.test.ts`.** Expect failure because the model does not exist.
- [ ] **Step 3: Implement pure parser/selector functions.** Reuse `forecastPoints`, `meteoAlarmEntries`, and `stateValue`. Map seven pollen keys to Norwegian species names, use `pollenForecast` availability as the season gate, select highest valid level, and reject unknown/unavailable. For frost, choose yesterday 18:00–today 09:00 before 09:00, otherwise today 18:00–tomorrow 09:00, in Europe/Oslo; use `sun.attributes.next_rising`/`next_setting` for the next event. Return `undefined` for invalid numerics, never 0 by coercing `unknown` or `unavailable`.
- [ ] **Step 4: Run `npm.cmd test -- src/client/weatherCardModel.test.ts` and `npm.cmd run build`.** Expect both to pass. Commit with `git add src/client/weatherCardModel.ts src/client/weatherCardModel.test.ts` then `git commit -m "feat: model seasonal weather card signals"`.

### Task 3: J card and AQI presentation

**Files:**
- Create: `src/client/V2WeatherCard.tsx`, `src/client/V2WeatherCard.test.tsx`
- Modify: `src/client/MainDashboardPrototype.tsx`, `src/client/MainDashboardPrototype.test.tsx`, `src/client/styles.css`, `src/client/App.tsx`

**Interfaces:**
- Produce `<V2WeatherCard states={states} onDetails={showWeather} />` with `states: Record<string, HomeAssistantState>` and `onDetails: () => void`.
- Consume `buildV2WeatherCardModel` and `GET /api/air-quality`; UI state is `AirQualityReading | null` and maps categories to Norwegian labels/icons/colors. Render a real unavailable state for `null`.

- [ ] **Step 1: Write failing card tests.** Assert weather/compass styling hooks, no condition-name text, `Følt som`, standalone temperature/pressure arrows with accessible trend words, compass before wind copy, six AQI segments + current marker + `US AQI`, pollen/frost/alert/daylight/unavailable states, primary `Regn siste time` and secondary `I dag`, pointer/Enter/Space activation, and failed AQI request showing unavailable without breaking weather. Use a mocked same-origin fetch; check exact icon sizes visually in Task 4.
- [ ] **Step 2: Run `npm.cmd test -- src/client/V2WeatherCard.test.tsx`.** Expect failure because the component does not exist.
- [ ] **Step 3: Build the component.** Use the J mockup's three open rows, an icon/color/category lookup for US AQI, CSS classes scoped to `.ppf-weather-j`, and existing Material Symbols or inline SVG for thick trend arrows. Fetch AQI on mount, recheck every 30 minutes, and clear timer/abort pending request on unmount. Include an `aria-label` that reads the AQI value/category and seasonal signal; expose unavailable data as text. Keep one card-level click and keyboard target with no nested controls.
- [ ] **Step 4: Put the new component in the default V2 weather slot.** In `MainDashboardPrototype.tsx`, replace the default `WeatherOverview ... ppf-weather-v1` branch with `<V2WeatherCard .../>`; retain `?weather-card=v2` for the older tile comparison until the team intentionally removes that switch. Update the default-card assertion in `MainDashboardPrototype.test.tsx`; preserve its comparison-switch test.
- [ ] **Step 5: Implement scoped CSS and source attribution.** Adapt J's wide top row, two unboxed environmental signals, six-color band scale, and three-column measurement rail to existing V2 tokens. Define 52 px weather glyph and 44 px wind compass, 38 px temperature, responsive stacking at narrow card width, visible focus ring, tabular numbers, and no clipping at tablet size. Add a subdued `Open-Meteo / CAMS` source line to the detailed weather view in `App.tsx`.
- [ ] **Step 6: Run `npm.cmd test -- src/client/V2WeatherCard.test.tsx src/client/MainDashboardPrototype.test.tsx src/client/App.test.tsx` and `npm.cmd run build`.** Expect all to pass. Commit with `git add src/client/V2WeatherCard.tsx src/client/V2WeatherCard.test.tsx src/client/MainDashboardPrototype.tsx src/client/MainDashboardPrototype.test.tsx src/client/styles.css src/client/App.tsx` then `git commit -m "feat: add J weather card to V2 dashboard"`.

### Task 4: Local integration and visual review

**Files:**
- Modify only files above if the checks reveal a defect.

- [ ] **Step 1: Run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`.** Expect zero failures, a successful Vite build, and no whitespace errors. There is no `lint` script in `package.json`; do not invent one.
- [ ] **Step 2: Start the verified worktree's dev stack on its assigned ports.** For the primary worktree use `npm.cmd run dev` and `http://127.0.0.1:5173`; for a secondary worktree use distinct configured API/Vite ports. Before touching listeners, verify owning command line and working directory per `AGENTS.md`.
- [ ] **Step 3: Visually review the default V2 card at 1920×1200 and 1220×785.** Confirm J hierarchy and live values, a legible rain-first rail, no clipping or overlapping cards, keyboard focus/action, and unavailable AQI. Inspect both pollen fixture and off-season frost/alert/daylight fixture states; ensure the six-band marker follows category rather than remaining at the mockup's 42 position.
- [ ] **Step 4: Stop only the verified project process tree and confirm its ports are free.** Record the branch, final commit hashes, test/build results, and any remaining data-source or design limitation. Do not push or deploy.

## Self-review checklist

- [ ] Every visual and data requirement in the spec maps to a task above.
- [ ] No example value from the mockup is used as a rendered constant.
- [ ] Component and API signatures above match the names used in later tasks.
- [ ] No placeholder instructions remain in the execution steps.
