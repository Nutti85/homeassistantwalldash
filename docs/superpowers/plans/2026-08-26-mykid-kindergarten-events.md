# MyKid kindergarten feed implementation plan

**Goal:** Import the second child’s selected MyKid parent information into Klara PostgreSQL, publish one Home Assistant sensor, and show it on WallDash—using exactly two n8n workflows.

**Architecture:** A dedicated Browserless profile performs read-only portal extraction. The importer normalizes the snapshot into purpose-built PostgreSQL tables. The publisher reads those tables and updates one Home Assistant sensor. WallDash reads that sensor only.

**Spec:** `docs/superpowers/specs/2026-08-26-mykid-kindergarten-events-design.md`

## Constraints

- Reuse n8n, Klara PostgreSQL, Home Assistant, and WallDash. Do not add cloud services or a custom worker.
- Keep the existing shared Browserless stack unchanged. Use `mykid-browserless` and its profile volume only for MyKid.
- The temporary debugger port exists only for manual sign-in, then is removed.
- Preserve the complete visible content of all six requested MyKid sections. Never save credentials, cookies, raw HTML, screenshots, attachments, or media.
- Use synthetic test fixtures exclusively.
- Keep successful n8n execution data out of history.

## Task 1 — Complete Browserless bootstrap

**Status:** service deployed; user login pending.

1. Open the dedicated Browserless debugger from a normal browser on the home network and authenticate to MyKid manually.
2. Run a one-page, read-only `/foreldre` session using the persistent data directory.
3. Restart Browserless and repeat that authentication check.
4. Remove the LAN port and debugger enablement; retain only the n8n network connection.
5. Add the Browserless token to an n8n HTTP credential, not workflow JSON.

**Acceptance:** a post-restart Browserless function reaches authenticated MyKid without credentials in code or n8n.

## Task 2 — Add normalized PostgreSQL storage

**Files:**

- `database/migrations/002_kindergarten_events.sql`
- `docs/n8n-mykid-kindergarten-events.md`

1. Inspect the actual Klara roles, extensions, timestamp trigger, and `people` key before writing a migration.
2. TDD: write a failing isolated-database assertion for two new tables.
3. Create `kindergarten_events` for dated events with a child-scoped unique source key, event-date index, audit timestamps, and restricted grants.
4. Create `kindergarten_updates` with `kind` limited to `noticeboard`, `weekly_plan`, `newsletter`, `birthday`, and `today`; child-scoped idempotency; title and full normalized visible text; effective date; last-seen and audit timestamps.
5. Add stale handling that only follows a successful complete snapshot. Failed source reads preserve rows.
6. Test duplicate upserts, invalid kinds, and child isolation.

**Acceptance:** all six MyKid categories have a minimal, child-owned persistence path without overloading Jacob’s email/PDF weekly-plan schema.

## Task 3 — Build the MyKid import workflow

**Files:**

- `n8n/mykid-import.json`
- `docs/n8n-mykid-kindergarten-events.md`
- synthetic extraction fixtures/tests as appropriate

1. Add manual trigger and initially inactive 08:00/18:00 Europe/Oslo schedules.
2. Call the private `/chromium/function` endpoint once per run.
3. Implement a small extractor that visits only the required MyKid parent routes and returns a complete structured snapshot of the requested visible content—not page HTML.
4. Return explicit `session_expired`, `source_changed`, or `invalid_snapshot` statuses. Do not turn an error into an empty successful import.
5. Validate record count, fields, Norwegian dates/times, and allowed kinds in n8n before database access. Reject malformed source data rather than silently censoring or truncating valid content.
6. Derive deterministic fallback keys only when MyKid exposes no usable key; upsert through the restricted ingestion credential.
7. Set execution-history pruning and create a private re-login notification path for session expiry.

**Acceptance:** repeated synthetic snapshots remain idempotent; failed snapshots change no confirmed rows.

## Task 4 — Build the MyKid publisher workflow

**Files:**

- `n8n/mykid-publish.json`
- `docs/n8n-mykid-kindergarten-events.md`

1. Add manual trigger and inactive 15-minute schedule.
2. Read current/future normalized items for the configured child from PostgreSQL.
3. Construct one Norwegian payload for `sensor.<child>_mykid`: state/health, source timestamp, events, notices, plan items, newsletters, birthdays, and today information.
4. Preserve full visible source text and omit only categories that are genuinely absent.
5. Publish through the existing Home Assistant credential and test empty, normal, stale, and unavailable outcomes.

**Acceptance:** the sensor contains no login or raw portal material and can be rendered without special MyKid browser access.

## Task 5 — Extend WallDash safely

**Files:**

- `src/shared/entities.ts`
- `src/server/index.ts`
- `src/server/homeAssistant.test.ts`
- `src/client/dashboardModel.ts`
- `src/client/weeklyPlan.test.ts`
- `src/client/App.tsx`
- `src/client/App.test.tsx`

1. Write failing parser and UI tests for a normal MyKid payload, empty payload, stale source, and unavailable entity.
2. Add a configured Home Assistant entity ID and typed defensive snapshot parser.
3. Add one compact MyKid carousel/detail view using existing calendar/Jacob presentation helpers where possible.
4. Preserve the user’s existing dirty dashboard changes and avoid putting private raw content in the UI.
5. Run focused tests, full test suite, and production build.

**Acceptance:** calendar and Jacob views remain unchanged; MyKid is readable, empty-safe, and error-safe.

## Task 6 — Deploy and verify end to end

1. Apply the migration through the established Klara database deployment path.
2. Import a synthetic snapshot, then one live manual run after login; inspect only record counts and schema, not family content.
3. Publish to Home Assistant and inspect the sensor schema/redaction.
4. Deploy WallDash only after explicit user authorization, preserving its existing Portainer environment variables.
5. Remove the Browserless LAN debugger endpoint; document session-expiry reauthentication.
6. Run `npm.cmd test`, `npm.cmd run build`, n8n workflow validation, and a final secret/profile check.

**Acceptance:** the production path is MyKid -> PostgreSQL -> Home Assistant -> WallDash, with no unneeded service, port, credential, or personal data retention.
