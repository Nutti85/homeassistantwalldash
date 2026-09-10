# Siden sist Family Inbox and Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the V2 past lane with a Frigate/Home Assistant Away capture, a persistent family inbox, and a meaningful home-event timeline while preserving complete Jacob/Zokrates and Nicolai/MyKid views.

**Architecture:** Add a typed server-side activity service that combines allow-listed Home Assistant recorder history with Frigate review metadata and proxies only matched media. Keep family message normalization and device-local read receipts in focused client modules, and render the three approved modules plus one tabbed family modal from `MainDashboardPrototype`.

**Tech Stack:** TypeScript, React 18, Express 5, Home Assistant REST history API, Frigate 0.17 REST API, Vitest, Testing Library, localStorage.

**Spec:** `docs/specs/2026-09-10-siden-sist-family-inbox-and-activity.md`

## Global Constraints

- Implement only on `codex/dashboard-prototype-v2`.
- Preserve the existing Walldash visual language and the current `Akkurat nå`, `Dette skjer`, and bottom controls.
- Browser requests never supply arbitrary Home Assistant entity IDs, Frigate camera names, timestamps, or upstream URLs.
- Home Assistant and Frigate credentials and upstream errors never reach the browser.
- Read state is local presentation state; it never mutates Zokrates, MyKid, Home Assistant, or PostgreSQL.
- The exact action copy is `Marker som lest` and `Marker som ulest`.
- Expired footage is never replaced with footage outside the completed Away interval.
- Use TDD for normalization, history reduction, activity selection, read receipts, endpoints, and interactive behavior.
- Before completion run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`, commit, push `codex/dashboard-prototype-v2`, and deploy only `homeassistant-wall-dashboard-v2` per `AGENTS.md`.

---

### Task 1: Define the shared activity contract and pure reducers

**Files:**
- Create: `src/shared/activity.ts`
- Create: `src/shared/activity.test.ts`
- Modify: `src/shared/entities.ts`

**Interfaces:**
- Produces: `ActivityEventKind`, `ActivityEvent`, `AwayCapture`, `ActivityPayload`, `HomeHistoryPoint`, `FrigateReviewItem`, `completedAwayIntervals()`, `selectAwayReview()`, and `normalizeTimeline()`.
- Consumes: no server or React dependencies.

- [ ] **Step 1: Write failing tests for completed Away intervals**

Cover a leading `Hjemme` state, one completed `Borte → Hjemme` pair, repeated identical states, an open current Away interval, invalid timestamps, and multiple completed intervals. Assert that the newest complete interval is returned and an open interval is excluded.

```ts
expect(completedAwayIntervals([
  { state: 'Hjemme', changedAt: '2026-09-10T06:00:00+02:00' },
  { state: 'Borte', changedAt: '2026-09-10T07:50:00+02:00' },
  { state: 'Hjemme', changedAt: '2026-09-10T14:53:00+02:00' },
])).toEqual([{ startedAt: '2026-09-10T07:50:00+02:00', endedAt: '2026-09-10T14:53:00+02:00' }]);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd test -- src/shared/activity.test.ts`

Expected: FAIL because `src/shared/activity.ts` does not exist.

- [ ] **Step 3: Implement the shared types and reducers**

Use the exact response contract from the spec. `selectAwayReview()` sorts by `start_time`, filters the completed interval, prefers the newest `alert`, then the newest `detection`. `normalizeTimeline()` removes invalid/unavailable/duplicate transitions and sorts newest first.

Extend `MyKidKindergartenItem` with `id?: string` so upstream identities survive parsing.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `npm.cmd test -- src/shared/activity.test.ts src/shared/weeklyPlanFormatter.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the shared contract**

```powershell
git add src/shared/activity.ts src/shared/activity.test.ts src/shared/entities.ts
git commit -m "feat: define activity timeline contract"
```

### Task 2: Read allow-listed activity history from Home Assistant

**Files:**
- Modify: `src/server/homeAssistant.ts`
- Modify: `src/server/homeAssistant.test.ts`
- Modify: `src/server/index.ts`
- Modify: `.env.example`
- Modify: `docker-compose.portainer.v2.yml`

**Interfaces:**
- Consumes: `HomeHistoryPoint` from `src/shared/activity.ts`.
- Produces: `HomeAssistantClient.getActivityHistory(start: Date, end: Date): Promise<Record<string, HomeHistoryPoint[]>>` and `ActivityEntityConfig`.

- [ ] **Step 1: Write failing Home Assistant history tests**

Assert one request to `/api/history/period/<start>` with only the configured `home`, doorbell visitor, front-door lock, and Frigate image entity IDs. Assert `minimal_response=true`, `no_attributes=true`, bounded `end_time`, timestamp normalization, malformed-row removal, and generic communication errors without tokens or upstream bodies.

- [ ] **Step 2: Run the focused server test and confirm RED**

Run: `npm.cmd test -- src/server/homeAssistant.test.ts`

Expected: FAIL because `getActivityHistory` and activity configuration do not exist.

- [ ] **Step 3: Add explicit activity configuration**

Add:

```ts
export interface ActivityEntityConfig {
  doorbellVisitor: string;
  frigateEvents: string[];
}
```

Parse `HA_DOORBELL_VISITOR_ENTITY_ID` and comma-separated `HA_FRIGATE_EVENT_ENTITY_IDS` in `src/server/index.ts`. Filter empty entries and reject non-`image.` Frigate entity IDs at startup with a configuration error that names the variable but not its value.

Add the variables to `.env.example` and `docker-compose.portainer.v2.yml`, leaving `HA_FRIGATE_EVENT_ENTITY_IDS` empty in the example and stack default.

- [ ] **Step 4: Implement the bounded history fetch**

Reuse `fetchWithTimeout()` and the existing recorder-history query pattern. Return normalized points with `entityId`, `state`, `changedAt`, and optional friendly metadata from the first full row when available. Do not expose a browser endpoint that accepts entity IDs.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npm.cmd test -- src/server/homeAssistant.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the Home Assistant activity source**

```powershell
git add src/server/homeAssistant.ts src/server/homeAssistant.test.ts src/server/index.ts .env.example docker-compose.portainer.v2.yml
git commit -m "feat: read home activity history"
```

### Task 3: Add the Frigate client and Away capture service

**Files:**
- Create: `src/server/frigate.ts`
- Create: `src/server/frigate.test.ts`
- Create: `src/server/activity.ts`
- Create: `src/server/activity.test.ts`
- Modify: `src/server/index.ts`
- Modify: `.env.example`
- Modify: `docker-compose.portainer.v2.yml`

**Interfaces:**
- Consumes: shared activity types and `HomeAssistantClient.getActivityHistory()`.
- Produces: `FrigateClient.getReviewItems(after: Date, before: Date)`, `FrigateClient.getReviewPreview(id)`, `FrigateClient.getRecordingClip(camera, start, end)`, and `ActivityService.getActivity(now?: Date): Promise<ActivityPayload>`.

- [ ] **Step 1: Write failing Frigate client tests**

Assert that review queries use `after`, `before`, and bounded `limit`; reject malformed IDs, camera names, timestamps, unexpected JSON, and non-2xx responses; apply an 8-second timeout; and convert all failures to `Kunne ikke kommunisere med Frigate` without upstream details.

- [ ] **Step 2: Run the Frigate tests and confirm RED**

Run: `npm.cmd test -- src/server/frigate.test.ts`

Expected: FAIL because `FrigateClient` does not exist.

- [ ] **Step 3: Implement `FrigateClient`**

The constructor is:

```ts
new FrigateClient(baseUrl: string, fetcher: typeof fetch = fetch)
```

Normalize `baseUrl` once. Do not support caller-provided URLs. Validate review IDs with a narrow Frigate-ID pattern and camera names with `/^[A-Za-z0-9_-]+$/`.

- [ ] **Step 4: Write failing orchestration tests**

Test the verified real-world shape: an Away interval 07:50–14:53 with a 14:50 car alert becomes the Away capture. Also cover available preview, preview missing with recording fallback, both media forms missing (`expired`), no review (`none`), Frigate failure, Home Assistant history failure, and 24-hour timeline fallback to seven days when fewer than three events exist.

- [ ] **Step 5: Implement `ActivityService`**

Build timeline rows only for the allow-listed state transitions in the spec. Match an HA Frigate image detection to the nearest Frigate review item for the same normalized camera/object within 30 seconds so its timeline row may receive a media path. Keep unmatched HA detections as informational rows.

- [ ] **Step 6: Add `FRIGATE_URL` configuration**

Add `FRIGATE_URL=` to `.env.example` and the V2 compose environment. When absent, construct the service without a Frigate client and return explicit unavailable/HA-only states instead of failing startup.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `npm.cmd test -- src/server/frigate.test.ts src/server/activity.test.ts src/server/homeAssistant.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the Frigate and activity services**

```powershell
git add src/server/frigate.ts src/server/frigate.test.ts src/server/activity.ts src/server/activity.test.ts src/server/index.ts .env.example docker-compose.portainer.v2.yml
git commit -m "feat: combine Frigate and Home Assistant activity"
```

### Task 4: Expose the activity payload and safe media proxies

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/server/app.test.ts`
- Modify: `src/client/api.ts`
- Modify: `src/client/api.test.ts`

**Interfaces:**
- Consumes: `ActivityService` and `ActivityPayload`.
- Produces: `GET /api/activity`, `GET /api/activity/review/:id/preview`, and `DashboardApi.getActivity(): Promise<ActivityPayload>`.

- [ ] **Step 1: Write failing Express endpoint tests**

Assert typed JSON from `/api/activity`, `503 { error: 'Aktivitet er ikke tilgjengelig' }` when no service is configured, a generic `502` on upstream failure, safe streaming headers, abort propagation, ID validation, and rejection of query parameters that attempt to supply URLs/cameras/timestamps.

- [ ] **Step 2: Run endpoint tests and confirm RED**

Run: `npm.cmd test -- src/server/app.test.ts`

Expected: FAIL because the activity routes are absent.

- [ ] **Step 3: Add optional activity dependencies to `createApp`**

Replace positional growth with an options object while retaining existing behavior:

```ts
type AppServices = {
  activity?: ActivityService;
  aiReportSecret?: string;
  aiReportSourceUrl?: string;
  aiReportRefreshUrl?: string;
  aiReportStorePath?: string;
};

createApp(client: DashboardClient, services?: AppServices): Express
```

Update all tests and `src/server/index.ts` in the same step.

- [ ] **Step 4: Implement JSON and media routes**

Use only IDs already resolved by `ActivityService`; do not turn the media route into a generic Frigate proxy. Set an appropriate video content type, `Cache-Control: private, max-age=30`, and stop upstream streaming when the browser disconnects.

- [ ] **Step 5: Add the client API method and tests**

`getActivity()` validates required top-level fields and throws the existing generic dashboard communication error for malformed/non-2xx responses.

- [ ] **Step 6: Run endpoint and client API tests**

Run: `npm.cmd test -- src/server/app.test.ts src/client/api.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the activity API**

```powershell
git add src/server/app.ts src/server/app.test.ts src/server/index.ts src/client/api.ts src/client/api.test.ts
git commit -m "feat: expose safe activity API"
```

### Task 5: Normalize family messages and persist read receipts

**Files:**
- Create: `src/client/familyInbox.ts`
- Create: `src/client/familyInbox.test.ts`
- Modify: `src/client/dashboardModel.ts`
- Modify: `src/client/dashboardModel.test.ts`

**Interfaces:**
- Consumes: `JacobWeeklyPlanSnapshot`, `MyKidKindergartenSnapshot`, and `HomeAssistantState`.
- Produces: `FamilyMessage`, `familyMessages(states)`, `readFamilyReceipts(storage?, now?)`, `writeFamilyReceipts(receipts, storage?, now?)`, and `setFamilyMessageRead(receipts, id, read, now?)`.

- [ ] **Step 1: Write failing normalization tests**

Assert MyKid upstream IDs are retained, fallback IDs are deterministic, Jacob IDs depend on normalized full message content rather than array index or source refresh time, messages sort newest first, relative-age input dates remain intact, and duplicate IDs collapse to one row.

- [ ] **Step 2: Write failing read-receipt tests**

Use storage key `smarthjem-family-message-reads-v1`. Cover empty storage, malformed JSON, read/unread toggling, duplicate receipt replacement, 365-day pruning, and a read message remaining present in the full message collection.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npm.cmd test -- src/client/familyInbox.test.ts src/client/dashboardModel.test.ts`

Expected: FAIL because the module and stable identities are absent.

- [ ] **Step 4: Implement pure normalization and lifecycle helpers**

Use a small deterministic browser-safe string hash over normalized UTF-16 input; do not import Node `crypto` into client code. Store only IDs and timestamps, never message bodies.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npm.cmd test -- src/client/familyInbox.test.ts src/client/dashboardModel.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit inbox state handling**

```powershell
git add src/client/familyInbox.ts src/client/familyInbox.test.ts src/client/dashboardModel.ts src/client/dashboardModel.test.ts
git commit -m "feat: add persistent family inbox state"
```

### Task 6: Build the tabbed family modal without losing person content

**Files:**
- Create: `src/client/FamilyInboxModal.tsx`
- Create: `src/client/FamilyInboxModal.test.tsx`
- Modify: `src/client/MainDashboardPrototype.tsx`
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes: normalized `FamilyMessage[]`, read receipts, Jacob and Nicolai snapshots.
- Produces: `FamilyInboxModal` with controlled `openTab`, `messageFilter`, selected message, and read/unread callbacks.

- [ ] **Step 1: Write failing modal behavior tests**

Assert the ordered top tabs `Beskjeder`, `Jacob`, `Nicolai`; secondary source labels; `Ulest`/`Alle`; explicit `Marker som lest`; read rows under `Alle`; `Marker som ulest`; full-message detail; and the helper copy from the spec.

Assert all six Jacob sections and all seven Nicolai sections are present in their person views. Assert marking a message read does not remove it from either person view.

Assert Escape close, backdrop close, close-button focus, tab keyboard behavior, and focus restoration to `Se alle`.

- [ ] **Step 2: Run modal tests and confirm RED**

Run: `npm.cmd test -- src/client/FamilyInboxModal.test.tsx`

Expected: FAIL because `FamilyInboxModal` does not exist.

- [ ] **Step 3: Extract and reuse existing person-detail renderers**

Move `FamilyDetailBody`, `mykidDetailSections`, chronological Jacob helpers, and person titles from `MainDashboardPrototype.tsx` into the new component or a sibling pure module. Preserve current content and empty states exactly unless the spec supplies replacement copy.

- [ ] **Step 4: Implement the modal and styles**

Use a wide modal at the tablet viewport, a three-tab top rail, inbox master-detail layout, and scrollable person content. Reuse existing `--ppf-*` tokens, source-tag treatments, focus rings, and modal backdrop language.

- [ ] **Step 5: Run modal and existing prototype tests**

Run: `npm.cmd test -- src/client/FamilyInboxModal.test.tsx src/client/MainDashboardPrototype.test.tsx`

Expected: PASS after updating only assertions intentionally superseded by the unified modal.

- [ ] **Step 6: Commit the unified family modal**

```powershell
git add src/client/FamilyInboxModal.tsx src/client/FamilyInboxModal.test.tsx src/client/MainDashboardPrototype.tsx src/client/styles.css
git commit -m "feat: unify family inbox and person views"
```

### Task 7: Build the Siden sist dashboard modules

**Files:**
- Create: `src/client/SinceLast.tsx`
- Create: `src/client/SinceLast.test.tsx`
- Modify: `src/client/MainDashboardPrototype.tsx`
- Modify: `src/client/MainDashboardPrototype.test.tsx`
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes: `ActivityPayload`, normalized family messages, read receipt callbacks, and the family-modal opener.
- Produces: `AwayCaptureCard`, `FamilyInboxCard`, `ActivityTimeline`, and `SinceLast`.

- [ ] **Step 1: Write failing component tests**

Cover available, expired, none, unavailable, and loading Away capture states; two newest unread messages and unread count; no read messages on the dashboard; five newest meaningful timeline rows; `Se alle`; safe/no-media behavior; and exact copy from the spec.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test -- src/client/SinceLast.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the three modules**

Use semantic sections and ordered lists. A playable capture uses the same-origin `mediaPath`; expired/unavailable captures do not render a play button. Relative ages use `Intl.RelativeTimeFormat('nb-NO')` with calendar-day differences in Europe/Oslo.

- [ ] **Step 4: Replace the existing past lane**

Change the lane heading to `SIDEN SIST`, remove the continuously scrolling two-person message lists, and mount `SinceLast`. Keep the family modal controlled by `MainDashboardPrototype` so focus can return to the invoking control.

- [ ] **Step 5: Implement responsive styles**

At 1920×1200, keep all three modules visible in the left lane without overlapping bottom controls. At the existing narrow breakpoint, stack modules before `Akkurat nå` only if the current source order requires it for reading; preserve a logical heading sequence and 48 px controls.

- [ ] **Step 6: Run component and prototype tests**

Run: `npm.cmd test -- src/client/SinceLast.test.tsx src/client/MainDashboardPrototype.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the redesigned past lane**

```powershell
git add src/client/SinceLast.tsx src/client/SinceLast.test.tsx src/client/MainDashboardPrototype.tsx src/client/MainDashboardPrototype.test.tsx src/client/styles.css
git commit -m "feat: replace past lane with since-last overview"
```

### Task 8: Load, poll, and recover activity data in the application shell

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`
- Modify: `src/client/MainDashboardPrototype.tsx`

**Interfaces:**
- Consumes: `DashboardApi.getActivity()` and `ActivityPayload`.
- Produces: confirmed activity state, loading/stale state, and `refreshActivity()` passed to the V2 prototype.

- [ ] **Step 1: Write failing lifecycle tests**

Use fake timers to assert initial fetch, 30-second visible polling, no polling while hidden, immediate refresh on visibility/focus/online, preservation of confirmed data after transient failures, and stale notice after three consecutive failures.

- [ ] **Step 2: Run App tests and confirm RED**

Run: `npm.cmd test -- src/client/App.test.tsx`

Expected: FAIL because activity lifecycle state is absent.

- [ ] **Step 3: Implement activity lifecycle state**

Keep activity failures isolated from `/api/states`; a failed activity request must not replace confirmed Home Assistant dashboard state or block family messages. Reset the failure counter only on a confirmed activity response.

- [ ] **Step 4: Run App and prototype tests**

Run: `npm.cmd test -- src/client/App.test.tsx src/client/MainDashboardPrototype.test.tsx src/client/SinceLast.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit activity lifecycle integration**

```powershell
git add src/client/App.tsx src/client/App.test.tsx src/client/MainDashboardPrototype.tsx
git commit -m "feat: refresh dashboard activity safely"
```

### Task 9: Verify the integrated experience locally

**Files:**
- Modify if required by verified defects only: files already listed in Tasks 1–8

**Interfaces:**
- Consumes: complete implementation.
- Produces: fresh automated, API, visual, and security evidence.

- [ ] **Step 1: Run the full automated suite**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 2: Run the production build and whitespace verification**

Run: `npm.cmd run build`

Expected: TypeScript and Vite build succeed.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 3: Start the approved local development stack**

Run `npm.cmd run dev` from the repository root. Inspect `.local-dev.log` if startup fails. Verify `http://127.0.0.1:3000/health` and `http://127.0.0.1:5173/api/states` before UI review.

- [ ] **Step 4: Verify the API with configured integrations**

Confirm `/api/activity` returns no credentials/upstream URLs, Away capture corresponds only to the latest completed Away interval, expired media returns the approved state, timeline contains only allow-listed events, and invalid media IDs fail without upstream details.

- [ ] **Step 5: Verify the UI at 1920×1200**

Capture the default dashboard, unread inbox, all-messages view, Jacob/Zokrates view, Nicolai/MyKid view, available recording, expired recording, empty timeline, and integration-error states. Confirm no overlap, truncation that hides actions, or inaccessible hit targets.

- [ ] **Step 6: Verify read-state persistence**

Mark a Jacob and Nicolai message read, reload, confirm both remain absent from the dashboard and present under `Alle` and their person tabs, then mark them unread and confirm dashboard eligibility returns.

- [ ] **Step 7: Stop only verified project processes**

Follow the process-command-line and working-directory checks in `AGENTS.md`; confirm ports 3000 and 5173 are no longer held by this project.

- [ ] **Step 8: Commit any verification-only fixes**

```powershell
git add <only-files-changed-for-verified-fixes>
git commit -m "fix: harden since-last dashboard states"
```

Skip this step when verification required no fixes.

### Task 10: Review, push, deploy, and verify V2 only

**Files:**
- No planned source changes.

**Interfaces:**
- Consumes: verified branch commits.
- Produces: reviewed origin branch and verified V2 deployment.

- [ ] **Step 1: Request code review**

Use `superpowers:requesting-code-review`. Resolve findings with targeted tests and repeat Task 9 checks for affected areas.

- [ ] **Step 2: Re-run required branch verification**

Run: `npm.cmd test`

Run: `npm.cmd run build`

Run: `git diff --check`

Expected: all pass with fresh output.

- [ ] **Step 3: Confirm branch and push**

Run: `git branch --show-current`

Expected: `codex/dashboard-prototype-v2`.

Run: `git push origin codex/dashboard-prototype-v2`

Expected: the verified commits are present on origin.

- [ ] **Step 4: Rediscover and restart the V2 Portainer stack**

Use the connected Portainer tooling, rediscover the environment and stack named `homeassistant-wall-dashboard-v2`, preserve every existing environment value, add the configured activity variables, and stop/start only that stack. Do not mutate V1.

- [ ] **Step 5: Verify production**

Confirm the V2 stack is active, then check `http://192.168.1.50:3200/health` and `http://192.168.1.50:3200/`. Re-run the key Away capture, timeline, message read/unread, Jacob, and Nicolai checks against production.

- [ ] **Step 6: Finish the development branch**

Use `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch`. Report the commit, push result, V2 stack identity, production health checks, known media-retention limitation, and any follow-up work.

## Plan self-review

- Spec coverage: every locked UX rule, data source, state, copy string, security rule, and deployment requirement maps to Tasks 1–10.
- Placeholder scan: implementation steps name exact files, interfaces, behaviors, commands, and expected outcomes; no deferred product decisions remain.
- Type consistency: `ActivityPayload` flows from shared types through `ActivityService`, Express, `DashboardApi`, `App`, and `SinceLast`; family IDs and receipts flow only through `familyInbox` and the family modal.

