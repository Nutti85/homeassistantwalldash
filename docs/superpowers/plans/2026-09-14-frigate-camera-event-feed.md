# Frigate camera event feed — implementation plan

> **For implementation:** Execute in a dedicated isolated worktree on `codex/dashboard-prototype-v2`. Follow the repository `AGENTS.md` V2 verification, commit, push and Portainer deployment procedure.

**Goal:** Replace the away-only camera card with a mode-filtered, grouped, seven-day Frigate event feed with safely proxied images/clips and immediate post-review refresh.

**Architecture:** Home Assistant recorder history yields eligible monitoring-mode intervals; Frigate REST yields reviews and media. `ActivityService` filters/groups the immutable domain data and issues media capabilities. A server-owned MQTT subscriber turns completed review notifications into a minimal SSE invalidation signal. React refetches the typed activity payload while retaining existing 30-second visible polling.

**Tech stack:** TypeScript, Express 5, React 18, Vitest, Frigate REST/MQTT, Home Assistant REST history, Server-Sent Events, `mqtt` npm package.

---

### Task 1: Record the camera-event vocabulary and contract

**Files:**
- Create: `CONTEXT.md`
- Modify: `src/shared/activity.ts`
- Modify: `src/shared/activity.test.ts`
- Modify: `src/client/api.ts`
- Modify: `src/client/api.test.ts`

**Steps:**
1. Add a concise glossary defining Frigate review, camera event group, monitoring interval, and confirmed review.
2. Write failing shared/client-contract tests for `CameraEventFeed`, review/group data, all status values, valid capability paths, and rejection of raw URLs or malformed data.
3. Add `CameraEventStatus`, `CameraReview`, `CameraEventGroup`, `CameraEventFeed` and `cameraEvents` to `ActivityPayload`; retain `awayCapture` temporarily only where server compatibility requires it.
4. Expand strict client decoding to validate every nested review and path.
5. Run `npm.cmd test -- src/shared/activity.test.ts src/client/api.test.ts`.
6. Commit: `feat(activity): define camera event feed contract`.

### Task 2: Make Home Assistant monitoring history a typed activity input

**Files:**
- Modify: `src/server/homeAssistant.ts`
- Modify: `src/server/homeAssistant.test.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/index.test.ts`
- Modify: `.env.example`

**Steps:**
1. Add `securityMode` to `ActivityEntityConfig` and ensure `getActivityHistory` requests it alongside the fixed activity entity allow-list.
2. Add a strict config parser for `HA_SECURITY_MODE_ENTITY_ID`, defaulting to the existing dashboard security entity and rejecting non-`input_number.*` values.
3. Test recorder history includes the configured security entity, normalizes baseline/transition rows, and configuration failures do not start the service.
4. Document the configuration default in `.env.example` without changing real credentials.
5. Run targeted server/index tests.
6. Commit: `feat(activity): read monitoring-mode history`.

### Task 3: Build the deterministic Frigate review filter and grouping model

**Files:**
- Modify: `src/server/activity.ts`
- Modify: `src/server/activity.test.ts`
- Modify: `src/shared/activity.ts`
- Modify: `src/shared/activity.test.ts`
- Modify: `src/server/frigate.ts`
- Modify: `src/server/frigate.test.ts`

**Steps:**
1. Start with failing tests for mode intervals: include review start in `1`/`2`, exclude `3`, unknown/unavailable and no known mode, and retain a review that ends after deactivation.
2. Add pure helpers to normalize relevant `person`/`car`/`dog` review objects, choose stable camera/zone identity, order Norwegian labels, and group same camera + zone within ten minutes. Define a deterministic group ID and make latest review first.
3. Test grouping edge cases: multi-object one review, distinct zones, 10-minute boundary, mixed camera spelling/underscores, order independence, and seven-day bounds.
4. Extend Frigate review parsing only for fields actually used; preserve strict validation and bounded 500-item request behavior.
5. Replace away-only selection in `ActivityService.getActivity` with seven-day camera feed creation. Return `inactive` when current mode is 3, `none` when active but empty, and `unavailable` only when authoritative data cannot be obtained.
6. Generate the existing textual `frigate` timeline rows from the same camera groups so card and timeline cannot disagree. Keep non-Frigate timeline semantics unchanged.
7. Run targeted shared/activity/frigate tests.
8. Commit: `feat(activity): group eligible Frigate reviews`.

### Task 4: Issue safe thumbnail and clip capabilities for selected reviews

**Files:**
- Modify: `src/server/activity.ts`
- Modify: `src/server/frigate.ts`
- Modify: `src/server/activity.test.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/app.test.ts`

**Steps:**
1. Write failing tests proving each output review only gets same-origin capability paths, never internal URL/camera query values.
2. Make thumbnail and preview probing bounded and independent per review. Use Frigate `/api/review/{id}/preview?format=mp4` as the clip source; do not rely on the recording clip endpoint as fallback.
3. Preserve metadata on thumbnail/preview 404/410 and mark that review expired. A missing media item must not fail the whole feed.
4. Reuse capability cache limits/expiry and enforce that only issued UUIDs resolve from the media routes.
5. Test streaming response headers, upstream error redaction, capability expiry, and one expired review alongside available siblings.
6. Run `npm.cmd test -- src/server/activity.test.ts src/server/app.test.ts src/server/frigate.test.ts`.
7. Commit: `feat(activity): proxy grouped review media safely`.

### Task 5: Add confirmed-review MQTT invalidation and SSE

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/server/frigateUpdates.ts`
- Create: `src/server/frigateUpdates.test.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/app.test.ts`
- Modify: `.env.example`
- Modify: `docker-compose.portainer.v2.yml`

**Steps:**
1. Add `mqtt` as an explicit production dependency; use its typed connection API, not shell commands or browser MQTT.
2. Write failing unit tests for config parsing, subscription to configured `frigate/reviews`, accepted `end` payload, ignored `new`/`update`/malformed payloads, reconnect behavior, listener cleanup, and duplicate coalescing.
3. Implement an injectable `FrigateUpdateService` that exposes a subscribe callback and never exposes MQTT payloads. It is optional: absent/failed MQTT leaves REST behavior working.
4. Add `GET /api/activity/updates` as a no-store SSE endpoint. Send a named `activity` event with `{}` only, heartbeat safely, remove listeners on close, and prevent an unbounded listener count.
5. Wire only validated, nonempty env settings in `index.ts`. Add blank MQTT variables and `FRIGATE_MQTT_TOPIC=frigate/reviews` in examples/compose; never add secrets to source control.
6. Run targeted update/app/index tests.
7. Commit: `feat(activity): refresh after confirmed Frigate reviews`.

### Task 6: Render the new camera module and accessible detail modal

**Files:**
- Modify: `src/client/SinceLast.tsx`
- Modify: `src/client/SinceLast.test.tsx`
- Modify: `src/client/styles.css`
- Modify: `src/client/MainDashboardPrototype.tsx` only if prop plumbing is needed

**Steps:**
1. Write component tests for the exact placement/order (`KAMERAHENDELSER`, Beskjeder, Hendelser), five-card limit, badge count, object/camera/zone copy, status copy, and text timeline rows.
2. Replace `AwayCaptureCard` in `SinceLast` with `CameraEventsCard`; remove away-specific UI without disturbing the family card.
3. Add an accessible modal: a selectable review gallery, latest selection by default, full group metadata including Armert/Notifikasjoner only in detail, a non-autoplay `Spill klipp` action, error recovery and expired-media state.
4. Reuse/extend existing focus-trap and media rendering behavior rather than creating a separate modal convention. Ensure selecting a thumbnail changes the video and accessible selected state.
5. Add CSS in the established warm/dark `ppf-*` system, using a genuine circular count badge and usable touch targets.
6. Run `npm.cmd test -- src/client/SinceLast.test.tsx`.
7. Commit: `feat(ui): show grouped camera events and review modal`.

### Task 7: Connect SSE refresh to the existing lifecycle

**Files:**
- Modify: `src/client/api.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`

**Steps:**
1. Add a small, injectable EventSource subscription helper that only listens to named `activity` events and supports close/error handling.
2. Write failing lifecycle tests: one `activity` event triggers one refresh, hidden tab disconnects/reconnects correctly, duplicate rapid notifications coalesce, EventSource failure preserves existing activity and polling remains active, cleanup closes source.
3. Connect it to the same `refresh()` mechanism after initial fetch. Keep the current 30-second, visible-only timer plus focus/online recovery unchanged.
4. Run `npm.cmd test -- src/client/App.test.tsx src/client/api.test.ts`.
5. Commit: `feat(ui): refresh activity feed from server events`.

### Task 8: Full verification, production configuration and V2 deployment

**Files:**
- Modify if needed: `docs/v2-deployment-runbook.md` (only reconcile deliberate camera configuration guidance; preserve unrelated user edits)

**Steps:**
1. Review `git diff` and ensure no unrelated root-worktree modifications are carried into the feature branch.
2. Run `npm.cmd test`, `npm.cmd run build`, and `git diff --check`; fix every failure.
3. Commit remaining changes, push `codex/dashboard-prototype-v2` to `origin`.
4. Re-discover the Portainer environment and stack named `homeassistant-wall-dashboard-v2` immediately before mutation.
5. Preserve every existing environment variable. Set the approved `FRIGATE_URL`, the 12 supplied person/car/dog `HA_FRIGATE_EVENT_ENTITY_IDS`, and only the user-provisioned read-only MQTT credentials/topic. If those credentials are unavailable, deploy the REST/polling feature without MQTT and tell the user that immediate push awaits them.
6. Stop/start only the discovered V2 stack. Verify active state, `http://192.168.1.50:3200/health`, `http://192.168.1.50:3200/`, and `/api/activity` returns the new safe contract.
7. Report the commit, deployment state, checks, and any remaining external credential action.
