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
- one dedicated private Browserless service in the existing n8n Portainer stack;
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
mykid-browserless (inside existing n8n Portainer stack)
       | private Docker network, token-authenticated /function request
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

The Browserless service belongs in the n8n stack, not the dashboard stack. n8n is its only caller; WallDash receives no MyKid credential, browser session, or direct browser access.

## Dedicated Browserless service

The service uses a pinned `ghcr.io/browserless/chromium` image rather than a custom worker image. Browserless exposes an authenticated `/function` endpoint that executes the compact, version-controlled MyKid extraction function and returns JSON directly to n8n.

- It owns one named Docker volume, `mykid-browser-profile`, mounted at Browserless `DATA_DIR`. No other service mounts this volume.
- It has no production host port. It is reachable only as `http://mykid-browserless:3000` from the n8n stack's default Docker network.
- Its Browserless token is a long random Portainer/n8n secret; n8n keeps it in an HTTP credential rather than workflow JSON.
- Browserless health checks report service readiness only and do not contact MyKid.
- The extraction function opens `https://mykid.no/foreldre`, verifies the authenticated parent navigation, and reads only the `Kommende hendelser` section.
- It returns a bounded JSON response: `fetched_at` and event `title`, ISO `date`, optional `start_time`/`end_time`, and optional short `details`. It neither returns raw HTML nor includes unrelated page content.
- The service is configured for one concurrent session and no queued sessions, preventing overlapping collection calls.

If the function is redirected to login, cannot find the event section, or receives an unexpected page, it returns a machine-readable failure such as `session_expired` or `source_changed`. It does not fabricate an empty success response.

### Initial login and session recovery

The profile must be created inside Browserless's own persistent volume; a desktop profile is never copied into Portainer.

For initial login or recovery, temporarily expose the dedicated Browserless debugger on the LAN only. The user enters the MyKid credentials directly in that view. After authentication is verified, remove the port and restart Browserless in private headless production mode. The temporary interactive view must never be exposed to the internet.

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

1. Call Browserless's private `POST /function` endpoint with the version-controlled extraction function.
2. Fail clearly on a Browserless error, without changing confirmed rows; send a private Home Assistant notification for `session_expired`.
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

- Preserve all existing n8n Portainer environment variables when adding the Browserless service.
- Use the n8n stack's private Docker network; do not publish the Browserless production port.
- Store the Browserless token and Home Assistant/PostgreSQL credentials as Portainer/n8n secrets, never in Compose, workflow JSON, source, logs, or chat.
- Treat `mykid-browser-profile` as credential material: do not share, export, or cloud-back it up.
- Pin the Browserless image version and retain the same data directory to reduce profile-encryption and cookie compatibility surprises.
- Poll at most twice daily and record only the least data needed for events.
- Apply a bounded execution-data retention policy in n8n, and run its security audit after deployment.

## Verification

1. Unit-test event parsing against saved synthetic HTML fixtures; no real MyKid content is committed.
2. In a temporary profile, verify interactive Browserless bootstrap login, clean service restart, and headless `/function` success.
3. Verify that a Browserless login expiry returns `session_expired`, preserves prior PostgreSQL events, and produces the private notification.
4. Run the import twice against the same synthetic response and verify no duplicate rows.
5. Remove an event from a synthetic response and verify it is withheld only after the grace-period rule.
6. Run the publisher and verify `sensor.<child>_kindergarten_events` has the expected compact attributes.
7. Verify WallDash displays normal, empty, and unavailable states.
8. Confirm Browserless has no published production port, n8n cannot mount the profile volume, and the dashboard stack has no Browserless access.
