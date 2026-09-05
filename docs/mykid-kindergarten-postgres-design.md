# MyKid kindergarten PostgreSQL design

**Status:** Proposed only — no production migration or data write has been run.  
**Scope:** Storage contract for the authenticated, read-only MyKid parser.

## Existing database boundary verified

The deployed Klara schema already has the ownership path needed for MyKid:

```text
households (household_id uuid)
  └─ people (person_id uuid, household_id, external_key)
```

`people` is unique on `(household_id, external_key)`. The existing restricted role is `klara_ingestion_api`; it has `SELECT`, `INSERT`, and `UPDATE` only. The MyKid migration extends that role with the same three privileges on the new tables. It does not grant `DELETE`, DDL, sequence ownership, or access to unrelated household rows.

Before writes are enabled, configure the intended child by the existing `household_id` plus a stable `people.external_key`. The migration deliberately does not seed, guess, or duplicate a person.

## Model

Two source-specific tables keep MyKid content out of the PDF/email-oriented weekly-plan model.

| Table | One row represents | Idempotency key |
| --- | --- | --- |
| `kindergarten_events` | A calendar event visible to one child | `(person_id, source_key)` |
| `kindergarten_updates` | Noticeboard, weekly plan, newsletter, birthday, or today item | `(person_id, kind, source_key)` |

`source_key` is a parser-produced, stable logical identifier. Prefer a source item ID when the portal exposes one; otherwise use a SHA-256 of a canonical, content-independent identity tuple (route, kind, visible publication/effective date, and normalized title). Do **not** use volatile DOM positions, a complete page hash, raw HTML, cookies, or credentials. `content_sha256` is a separate digest of the normalized stored fields and detects material edits to the same logical item.

`source_metadata` is a JSONB object for bounded, visible structured fields which do not deserve a first-class column. It must never contain raw HTML, browser state, screenshots, attachments, or session material.

## Proposed migration

Run once as the Klara database owner, using `psql -v ON_ERROR_STOP=1`. This is an atomic, new-table-only migration; no concurrent indexes are necessary because the tables are created empty. The deployment runner should set a short lock timeout and retry at a quiet time rather than wait indefinitely.

```sql
SET lock_timeout = '5s';
SET statement_timeout = '30s';

BEGIN;

CREATE TABLE kindergarten_events (
  kindergarten_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(person_id),
  source_key text NOT NULL,
  title text NOT NULL,
  event_date date NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  date_text text,
  time_text text,
  details text NOT NULL DEFAULT '',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL,
  source_published_at timestamptz,
  source_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  missing_success_count integer NOT NULL DEFAULT 0,
  stale_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kindergarten_events_person_source_key_key
    UNIQUE (person_id, source_key),
  CONSTRAINT kindergarten_events_source_key_check
    CHECK (btrim(source_key) <> '' AND octet_length(source_key) <= 512),
  CONSTRAINT kindergarten_events_title_check
    CHECK (btrim(title) <> '' AND octet_length(title) <= 10000),
  CONSTRAINT kindergarten_events_details_check
    CHECK (octet_length(details) <= 1000000),
  CONSTRAINT kindergarten_events_metadata_check
    CHECK (jsonb_typeof(source_metadata) = 'object'),
  CONSTRAINT kindergarten_events_content_sha256_check
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT kindergarten_events_time_range_check
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT kindergarten_events_missing_success_count_check
    CHECK (missing_success_count >= 0)
);

CREATE INDEX idx_kindergarten_events_person_id
  ON kindergarten_events (person_id);
CREATE INDEX idx_kindergarten_events_active_person_date
  ON kindergarten_events (person_id, event_date, starts_at)
  WHERE stale_at IS NULL;

CREATE TABLE kindergarten_updates (
  kindergarten_update_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(person_id),
  kind text NOT NULL,
  source_key text NOT NULL,
  effective_date date,
  published_at timestamptz,
  source_updated_at timestamptz,
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  missing_success_count integer NOT NULL DEFAULT 0,
  stale_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kindergarten_updates_person_kind_source_key_key
    UNIQUE (person_id, kind, source_key),
  CONSTRAINT kindergarten_updates_kind_check
    CHECK (kind IN ('noticeboard', 'weekly_plan', 'newsletter', 'birthday', 'today')),
  CONSTRAINT kindergarten_updates_source_key_check
    CHECK (btrim(source_key) <> '' AND octet_length(source_key) <= 512),
  CONSTRAINT kindergarten_updates_title_check
    CHECK (octet_length(title) <= 10000),
  CONSTRAINT kindergarten_updates_body_check
    CHECK (btrim(body) <> '' AND octet_length(body) <= 2000000),
  CONSTRAINT kindergarten_updates_metadata_check
    CHECK (jsonb_typeof(source_metadata) = 'object'),
  CONSTRAINT kindergarten_updates_content_sha256_check
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT kindergarten_updates_missing_success_count_check
    CHECK (missing_success_count >= 0)
);

CREATE INDEX idx_kindergarten_updates_person_id
  ON kindergarten_updates (person_id);
CREATE INDEX idx_kindergarten_updates_active_person_kind_effective
  ON kindergarten_updates
     (person_id, kind, effective_date DESC NULLS LAST, published_at DESC NULLS LAST)
  WHERE stale_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON TABLE
  kindergarten_events,
  kindergarten_updates
TO klara_ingestion_api;

COMMIT;
```

The byte limits are rejection limits, not truncation. The parser must reject a malformed or unbounded response before this transaction; it must never silently shorten valid portal text.

## Transactional import contract

Each run supplies one `snapshot_at` instant to every upsert. It resolves the configured child first:

```sql
SELECT person_id
FROM people
WHERE household_id = $1::uuid AND external_key = $2::text;
```

Exactly one row is required. A missing or ambiguous mapping is a configuration failure and the workflow must stop before an upsert.

For each parsed event, use a parameterized `INSERT … ON CONFLICT` against `(person_id, source_key)`. For updates, use `(person_id, kind, source_key)`. Both forms reset staleness and record that the item appeared in this snapshot:

```sql
INSERT INTO kindergarten_updates AS target (
  person_id, kind, source_key, effective_date, published_at, source_updated_at,
  title, body, source_metadata, content_sha256, first_seen_at, last_seen_at
)
VALUES (
  $1::uuid, $2::text, $3::text, $4::date, $5::timestamptz, $6::timestamptz,
  $7::text, $8::text, $9::jsonb, $10::text, $11::timestamptz, $11::timestamptz
)
ON CONFLICT (person_id, kind, source_key) DO UPDATE
SET effective_date = EXCLUDED.effective_date,
    published_at = EXCLUDED.published_at,
    source_updated_at = EXCLUDED.source_updated_at,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    source_metadata = EXCLUDED.source_metadata,
    content_sha256 = EXCLUDED.content_sha256,
    last_seen_at = EXCLUDED.last_seen_at,
    missing_success_count = 0,
    stale_at = NULL,
    updated_at = CASE
      WHEN target.effective_date IS DISTINCT FROM EXCLUDED.effective_date
        OR target.published_at IS DISTINCT FROM EXCLUDED.published_at
        OR target.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at
        OR target.title IS DISTINCT FROM EXCLUDED.title
        OR target.body IS DISTINCT FROM EXCLUDED.body
        OR target.source_metadata IS DISTINCT FROM EXCLUDED.source_metadata
        OR target.content_sha256 IS DISTINCT FROM EXCLUDED.content_sha256
      THEN clock_timestamp()
      ELSE target.updated_at
    END;
```

Use the corresponding event columns and conflict target for events. For batch ingestion, feed `jsonb_to_recordset` with a parameterized JSON array instead of interpolating portal content into SQL. Compute all hashes in the parser; the database receives only validated values.

## Stale grace rule

No scrape failure may make data stale. After all upserts succeed, in the *same transaction*, run the stale step only for a parser-confirmed complete section. The default grace is **three successful complete snapshots**. At two runs per day, an item therefore remains active for at least roughly a day after it first disappears.

For an update section, the parameterized form is:

```sql
UPDATE kindergarten_updates
SET missing_success_count = missing_success_count + 1,
    stale_at = CASE
      WHEN missing_success_count + 1 >= $4::integer THEN COALESCE(stale_at, $3::timestamptz)
      ELSE stale_at
    END,
    updated_at = CASE
      WHEN missing_success_count + 1 >= $4::integer AND stale_at IS NULL
      THEN clock_timestamp() ELSE updated_at
    END
WHERE person_id = $1::uuid
  AND kind = $2::text
  AND stale_at IS NULL
  AND last_seen_at < $3::timestamptz;
```

Use the equivalent query without `kind` for events. Only run it after the relevant route completed and was authenticated; skip it entirely for `session_expired`, `source_changed`, timeout, selector failure, or a partial snapshot. Reappearing rows are revived by the normal upsert. Nothing is automatically deleted; manual retention/deletion is a separate, explicit decision.

## Pre-deployment checks

1. Run this migration and schema assertions on a disposable PostgreSQL 17 instance first.
2. Seed or identify the intended child mapping outside the import workflow.
3. Test a synthetic fixture twice and verify one row per idempotency key.
4. Test one complete synthetic snapshot with an omitted item three times; verify it becomes stale, not deleted.
5. Test a failed or partial snapshot; verify no `missing_success_count` changes.
6. Only then add these two tables to the existing n8n PostgreSQL credential and keep the MyKid import workflow inactive until a manual live validation passes.

## Live MyKid inspection findings (2026-09-03)

The authenticated Browserless profile was verified through the n8n read-only inspection workflow. The Browserless function must return the documented data/type envelope, and the n8n HTTP node must use the persisted profile launch argument.

Observed stable DOM selectors:

- Calendar events: `.fc-dayGridMonth-view .fc-daygrid-event-harness > a.fc-event` (15 records in the live snapshot).
- Birthdays: `.content.birthdays tr` (10 records).
- Newsletter: `.newslist` (6 records).
- Weekly plan and “Dagen min”: the visible shell is `.relative_geek`; data is populated by `/_ajax/dagenmin/show_myday` and `/_ajax/dagenmin/show_myday_photos`.
- Calendar data is populated by `/_ajax/calendar/fetch_calendar_week`.
- Noticeboard content is not represented by the navigation `<li class="selected">`; it requires a dedicated content/AJAX extractor.

The network probe captured only endpoint paths, methods, status codes, and payload sizes. No portal content was retained.
