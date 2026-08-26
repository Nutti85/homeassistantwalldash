# MyKid kindergarten feed: design

**Status:** In progress — dedicated browser service deployed; awaiting the user’s one-time browser login
**Date:** 2026-08-26

## Goal

Bring the second child’s useful MyKid parent information into the established household path:

```text
MyKid -> n8n ingestion -> Klara PostgreSQL -> n8n publisher -> Home Assistant -> WallDash
```

The two workflows are deliberately the same shape as Jacob’s existing weekly-plan flow. MyKid authentication, browser state, and raw portal pages never reach Home Assistant or WallDash.

## Confirmed feasibility

A disposable local test proved that a manually authenticated MyKid parent session reaches `/foreldre`, exposes the requested parent information, and remains authenticated after a headless browser restart when its profile is persisted. The test profile and script were destroyed. No MyKid credentials or real portal data were retained.

## In-scope information

The source snapshot includes these requested parent sections:

- Oppslagstavla (noticeboard)
- Ukeplaner (weekly plans)
- Nyhetsbrev (newsletters)
- Kommende hendelser (upcoming events)
- Kommende bursdager (upcoming birthdays)
- Dagen min (the child’s day)

The import is strictly read-only. It never registers attendance, replies, downloads media, changes portal data, or bypasses login challenges.

## Source-fidelity rules

The requested MyKid sections are imported as they are visible to the authenticated parent. The system must not censor, anonymise, or selectively omit their content:

| Category | Stored and published information |
| --- | --- |
| Noticeboard, weekly plan, newsletter | title, date, and full visible text |
| Upcoming event | title, date, time, details, and other visible event metadata |
| Birthday | names, date, and other visible birthday information |
| Today | the complete visible “Dagen min” text and activity information |

Extraction converts visible page content to normalized plain text and structured fields; it does not retain browser cookies, passwords, session storage, raw HTML, screenshots, attachments, or media. Technical validation may reject an unexpectedly malformed or unbounded source response, but it must not silently truncate or redact valid portal content. No AI processing is needed.

## Reused architecture

| Existing service | Reuse |
| --- | --- |
| n8n | exactly two workflows: one import and one publisher |
| Klara PostgreSQL | existing household/person ownership and PostgreSQL credentials |
| Home Assistant | existing state API and bearer credential pattern |
| WallDash | existing dashboard state contract and carousel/detail components |
| Browserless | the same maintained self-hosted technology, but a dedicated MyKid instance/profile |

The current shared Browserless instance is not reused: it is shared and LAN-exposed. A dedicated `mykid-browserless` Portainer stack is attached only to `n8n_default`; this avoids changing n8n’s existing compose/env configuration and ensures that only n8n can call the production endpoint.

## Browserless and authentication

The dedicated service uses a pinned Chromium image, `DATA_DIR=/data`, a named `mykid_browser_profile` volume, one concurrent session, no queue, and a unique access token stored only in Portainer/n8n credentials. Browserless v2 creates temporary data directories below `DATA_DIR` by default, so every MyKid call must explicitly include `--user-data-dir=/data/mykid-profile`; this stable directory is the authenticated profile and is never mounted by n8n.

For one-time authentication it has a temporary LAN-only debugger port. The user signs in directly on that remote browser; no password is supplied to n8n, source code, or this task. Once the session is verified after a service restart, the port is removed and the service remains private to n8n. Session expiry leads to the same manual re-login path; CAPTCHA, MFA, and other access controls are never automated or bypassed.

## Data model

Reuse `people` and `households`, but do not place arbitrary portal content in Jacob’s PDF/email-oriented `weekly_plans` schema.

Add two MyKid-specific tables linked to `people.person_id`:

1. `kindergarten_events` for date/time events, with `UNIQUE (person_id, source_key)`.
2. `kindergarten_updates` for noticeboard, weekly-plan, newsletter, birthday, and today items. It has a constrained `kind` value, source key, effective/published date, title, full normalized text, `last_seen_at`, and audit timestamps; again `UNIQUE (person_id, kind, source_key)`.

The import uses a successful-snapshot grace period before marking source items stale. A scrape failure never erases confirmed data.

## Two n8n workflows

### 1. MyKid import

Manual trigger plus two inactive initial schedules (08:00 and 18:00, Europe/Oslo):

1. Call Browserless’s authenticated `/chromium/function` endpoint once, including the configured stable `--user-data-dir` launch argument.
2. Navigate only to the required visible parent routes, validate authenticated navigation, and return the complete visible requested content as structured JSON—not HTML.
3. Validate category, size, dates, times, and text limits; return `session_expired` or `source_changed` on unexpected source state.
4. Upsert events and updates using the existing restricted Klara ingestion credential.
5. Keep successful execution data out of n8n history and retain failed diagnostic metadata briefly.

### 2. MyKid publish

Manual trigger plus the existing 15-minute publishing cadence:

1. Read future events, current-week plan material, recent noticeboard/newsletter items, birthday count/date, and today’s activity from PostgreSQL.
2. Build one compact Norwegian sensor payload, `sensor.<child>_mykid`, containing health/summary text, `source_updated_at`, `events`, and the category collections.
3. Publish through the existing Home Assistant credential.

One sensor keeps the Home Assistant and WallDash changes small, while PostgreSQL remains the complete normalized source of truth.

## WallDash contract

WallDash receives only the MyKid sensor attributes. It adds one compact MyKid view beside the existing calendar and Jacob weekly-plan views, with normal, empty, stale, and unavailable states. The user can read current information but cannot act on it from the dashboard.

## Verification

1. Synthetic fixtures cover every category, malformed data, and extraction size limits; no real MyKid content is committed.
2. User signs in through the dedicated Browserless debugger; restart Browserless and verify `/foreldre` still authenticates.
3. Import the same fixture twice and prove there are no duplicates; remove an item and prove the grace rule prevents premature deletion.
4. Verify session expiry preserves confirmed PostgreSQL rows and produces a private re-login notification.
5. Verify the publisher’s sensor contract and WallDash’s normal, empty, stale, and unavailable rendering.
6. Remove the LAN debugger port after bootstrap and confirm only n8n can call Browserless.
