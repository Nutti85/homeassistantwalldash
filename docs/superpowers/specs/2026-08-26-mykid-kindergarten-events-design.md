# MyKid kindergarten events: design

**Status:** Proposed for review  
**Date:** 2026-08-26

## Goal

Read upcoming kindergarten events from the user's authenticated MyKid parent portal, retain only the normalized event data in the private Klara PostgreSQL database, and publish those events to Home Assistant for WallDash.

The solution must reuse the established Jacob pattern:

```text
source ingestion -> PostgreSQL -> Home Assistant sensor -> WallDash
```

## Confirmed feasibility

A throwaway local Playwright test established that:

- an interactive MyKid parent login reaches `/foreldre`;
- the authenticated parent page has a `Kommende hendelser` section;
- a fresh tab reuses the authenticated session; and
- an actual headless browser restart can reuse the saved persistent browser profile and reach `/foreldre` without a new login.

The test profile and test script were deleted immediately after the test. No MyKid credentials or child data were retained.

## Scope

In scope:

- upcoming events from the MyKid parent portal only;
- one browser worker in the existing n8n Portainer stack;
- a dedicated, minimum PostgreSQL event model;
- two n8n workflows: ingest and publish;
- a Home Assistant sensor and a small WallDash presentation extension.

Out of scope:

- messages, newsletters, media, attendance, absence, contacts, birthdays, health information, or child photos;
- automatic interaction with MyKid (registration, attendance, replies, or changes);
- a public browser-worker endpoint;
- n8n Cloud, external data stores, or AI processing of MyKid content.

## Architecture

```text
MyKid parent portal
       |
       | authenticated persistent browser profile
       v
mykid-browser-worker (inside existing n8n Portainer stack)
       | private Docker network, token-authenticated /events request
       v
n8n workflow 1: import events
       |
       v
Klara PostgreSQL
       |
       v
n8n workflow 2: publish sensor
       |
       v
Home Assistant sensor -> WallDash
```

The worker belongs in the n8n stack, not the dashboard stack. n8n is its only caller; WallDash receives no MyKid credential, browser session, or direct worker access.

## Browser worker

The worker is a small, custom container image containing a pinned Playwright/Chromium version and a narrow HTTP service.

- It runs as a fixed non-root container user.
- It owns one named Docker volume, `mykid-browser-profile`, which stores the browser profile. No other service mounts this volume.
- Its only production endpoint is `POST /events`. It requires a long random bearer token held in Portainer/n8n secrets.
- `GET /health` reports worker readiness only and never contacts MyKid.
- It uses Playwright's persistent browser context, opens `https://mykid.no/foreldre`, verifies the authenticated parent navigation, and reads only the `Kommende hendelser` section.
- It returns a bounded JSON response: `fetched_at` and event `title`, ISO `date`, optional `start_time`/`end_time`, and optional short `details`. It neither returns raw HTML nor includes unrelated page content.
- A per-process lock rejects overlapping collection calls.

If the worker is redirected to login, cannot find the event section, or receives an unexpected page, it returns a machine-readable failure such as `session_expired` or `source_changed`. It does not fabricate an empty success response.

### Initial login and session recovery

The profile must be created inside the worker's own persistent volume; a desktop profile is never copied into Portainer.

For initial login or recovery, temporarily enable a LAN-restricted interactive bootstrap view for this worker only. The user enters the MyKid credentials directly in that view. After authentication is verified, disable the bootstrap exposure and restart the worker in headless production mode. The temporary interactive view must never be exposed to the internet.

MyKid session expiry is expected. The recovery path is manual re-login; the solution must not bypass multi-factor challenges, CAPTCHAs, rate limits, or access controls.

## PostgreSQL model

Do not force MyKid data into `weekly_plans`: that schema represents a school PDF, Gmail traceability, homework, and class schedules.

Add a purpose-built `kindergarten_events` table linked to the correct `people.person_id`:

| Column | Purpose |
| --- | --- |
| `kindergarten_event_id` | UUID primary key |
| `person_id` | Child ownership boundary |
| `source_key` | Stable MyKid event identifier/URL when available, otherwise canonical content hash |
| `title` | Event title |
| `event_date` | Date-only event date |
| `start_time`, `end_time` | Optional local times |
| `details` | Optional minimal event description |
| `last_seen_at` | Timestamp of the successful fetch that contained the event |
| `created_at`, `updated_at` | Audit timestamps |

Use `UNIQUE (person_id, source_key)` for idempotent upserts and an index suitable for `person_id`, `event_date`, and `last_seen_at` publication queries. The migration also seeds or verifies the selected child's stable `people.external_key`; the actual key and display label are configuration values, never hard-coded browser data.

No raw MyKid page, browser screenshot, session material, or login identity is inserted into PostgreSQL.

## n8n workflows

### 1. Import kindergarten events

Manual trigger plus a twice-daily schedule.

1. Call the worker's private `POST /events` endpoint.
2. Fail clearly on a worker error, without changing confirmed rows; send a private Home Assistant notification for `session_expired`.
3. Validate types, date/time formats, maximum response size, and that every event has a title/date.
4. Create a stable `source_key` only when the worker cannot provide one.
5. Upsert normalized event rows with the restricted Klara PostgreSQL ingestion credential.
6. Mark events not seen in a successful run as stale only after a short grace period. This avoids showing cancelled events while protecting existing data from transient scrape failures.

The workflow retains no successful raw response in n8n execution history.

### 2. Publish kindergarten events

Manual trigger plus the established 15-minute schedule.

1. Query only future, non-stale events for the selected child through the restricted PostgreSQL read credential.
2. Produce a compact Norwegian `summary`, `source_updated_at`, and sorted `events` collection.
3. Publish `POST /api/states/sensor.<child>_kindergarten_events` through the existing restricted Home Assistant credential.

The state value is a short source/health label; all event values are sensor attributes. A failed publish never alters PostgreSQL data.

## WallDash contract

The server adds the new Home Assistant sensor entity ID to its existing dashboard-state contract. The client adds a compact kindergarten-events view to the existing calendar/Jacob-plan carousel, reusing the existing typed event presentation and accessible detail pattern.

The UI must render missing or unavailable data without exposing error details or MyKid-specific authentication state.

## Security and operations

- Preserve all existing n8n Portainer environment variables when adding the worker service.
- Use a private Docker network; do not publish the worker API port.
- Store the worker bearer token and Home Assistant/PostgreSQL credentials as Portainer/n8n secrets, never in Compose, workflow JSON, source, logs, or chat.
- Treat `mykid-browser-profile` as credential material: do not share, export, or cloud-back it up.
- Pin browser-image versions and retain the same worker user to reduce profile-encryption and cookie compatibility surprises.
- Poll at most twice daily and record only the least data needed for events.
- Apply a bounded execution-data retention policy in n8n, and run its security audit after deployment.

## Verification

1. Unit-test event parsing against saved synthetic HTML fixtures; no real MyKid content is committed.
2. In a temporary profile, verify interactive bootstrap login, clean worker restart, and headless `/events` success.
3. Verify that a worker login expiry returns `session_expired`, preserves prior PostgreSQL events, and produces the private notification.
4. Run the import twice against the same synthetic response and verify no duplicate rows.
5. Remove an event from a synthetic response and verify it is withheld only after the grace-period rule.
6. Run the publisher and verify `sensor.<child>_kindergarten_events` has the expected compact attributes.
7. Verify WallDash displays normal, empty, and unavailable states.
8. Confirm the worker has no published production port, n8n cannot mount the profile volume, and the dashboard stack has no worker access.
