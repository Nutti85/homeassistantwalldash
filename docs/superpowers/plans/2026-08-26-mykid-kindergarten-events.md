# MyKid Kindergarten Events Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Import upcoming MyKid events through a private persistent Browserless profile, store them in Klara PostgreSQL, then publish Home Assistant sensor data to WallDash.

**Architecture:** A dedicated Browserless service runs in the n8n Portainer stack with its own persistent data volume and no public port. Import workflow: Browserless to PostgreSQL. Publisher workflow: PostgreSQL to Home Assistant. WallDash reads only the Home Assistant sensor.

**Tech Stack:** Portainer Compose, Browserless Chromium, Puppeteer function API, n8n, PostgreSQL, Home Assistant, React, TypeScript, Vitest.

**Spec:** docs/superpowers/specs/2026-08-26-mykid-kindergarten-events-design.md

## Global Constraints

- Poll twice daily at most and read only parent-page upcoming events.
- Do not retain raw HTML, screenshots, messages, media, attendance, contacts, health data, credentials, or browser identity.
- Keep the existing shared Browserless stack unchanged. Use a dedicated private service in n8n stack.
- Browserless profile volume is mounted only by Browserless; its production port is not published.
- Preserve existing n8n environment variables and network attachments.
- Keep all tokens and credentials in Portainer/n8n, not code, exports, logs, or chat.
- User manually reauthenticates when MyKid session expires.

## File Structure

| File | Responsibility |
| --- | --- |
| database/migrations/002_kindergarten_events.sql | Event storage and restricted grants |
| n8n/mykid-import-kindergarten-events.json | Import workflow |
| n8n/mykid-publish-kindergarten-events.json | Publisher workflow |
| docs/n8n-mykid-kindergarten-events.md | Setup and recovery runbook |
| src/shared/entities.ts and src/server/index.ts | State key and entity configuration |
| src/client/dashboardModel.ts and src/client/App.tsx | Sensor parsing and carousel slide |
| relevant test files | Unit and interaction coverage |

### Task 1: Create event storage

**Files:**
- Create: database/migrations/002_kindergarten_events.sql
- Create: docs/n8n-mykid-kindergarten-events.md

**Interfaces:**
- Consumes: people person_id and external_key.
- Produces: kindergarten_events for both workflows.

- [ ] **Step 1: Write the failing migration assertion**

    DO $$ BEGIN
      IF to_regclass('public.kindergarten_events') IS NULL THEN
        RAISE EXCEPTION 'kindergarten_events was not created';
      END IF;
    END $$;

Run it in isolated test database. Expected: failure.

- [ ] **Step 2: Implement table, deduplication, index, and grants**

    CREATE TABLE kindergarten_events (
      kindergarten_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      person_id uuid NOT NULL REFERENCES people(person_id) ON DELETE CASCADE,
      source_key text NOT NULL,
      title text NOT NULL CHECK (length(btrim(title)) > 0),
      event_date date NOT NULL,
      start_time time,
      end_time time,
      details text,
      last_seen_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (person_id, source_key),
      CHECK (end_time IS NULL OR start_time IS NULL OR end_time >= start_time)
    );
    CREATE INDEX kindergarten_events_publish_idx
      ON kindergarten_events (person_id, event_date, last_seen_at DESC);
    GRANT SELECT, INSERT, UPDATE ON kindergarten_events TO klara_ingestion_api;
    GRANT SELECT ON kindergarten_events TO klara_read_api;

Add BEFORE UPDATE trigger setting updated_at to now. Use actual existing restricted-role names if different.

- [ ] **Step 3: Verify and commit**

Insert duplicate person/source_key in isolated DB. Expected: second insert fails.

    git add database/migrations/002_kindergarten_events.sql docs/n8n-mykid-kindergarten-events.md
    git commit -m "feat: add kindergarten event storage"

### Task 2: Deploy dedicated Browserless

**Files:**
- Modify: docs/n8n-mykid-kindergarten-events.md
- Modify: live Portainer n8n stack after rediscovery

**Interfaces:**
- Consumes: n8n internal Docker network and a fresh Browserless token.
- Produces: private Browserless function endpoint and persistent profile.

- [ ] **Step 1: Rediscover Portainer state**

Read the stack named n8n, its environment ID, compose source, environment variable names, and networks. Preserve all existing values when updating; record no secrets.

- [ ] **Step 2: Add Browserless service**

    mykid-browserless:
      image: ghcr.io/browserless/chromium@sha256:verified-image-digest
      environment:
        TOKEN: MYKID_BROWSERLESS_TOKEN
        DATA_DIR: /data
        CONCURRENT: "1"
        QUEUED: "0"
        TIMEOUT: "60000"
        HEALTH: "true"
        ENABLE_DEBUGGER: "false"
      volumes:
        - mykid-browser-profile:/data
      shm_size: "1gb"
      restart: unless-stopped

Add stack volume mykid-browser-profile. Do not add ports. Do not mount the volume into n8n or dashboard.

- [ ] **Step 3: Add deployment configuration**

    MYKID_BROWSERLESS_TOKEN=fresh-random-secret
    MYKID_PERSON_EXTERNAL_KEY=selected-child-stable-key
    MYKID_HA_ENTITY_ID=sensor.selected_child_kindergarten_events

- [ ] **Step 4: Bootstrap and verify persistence**

Before login, invoke internal Browserless function to open parent page. Expected: session_expired.

Temporarily expose authenticated debugger only on LAN. User signs in. Remove debugger port, redeploy headlessly, invoke same function after restart. Expected: authenticated status and no external port.

- [ ] **Step 5: Commit runbook**

    git add docs/n8n-mykid-kindergarten-events.md
    git commit -m "docs: add MyKid Browserless operations"

### Task 3: Create Browserless import workflow

**Files:**
- Create: n8n/mykid-import-kindergarten-events.json
- Modify: docs/n8n-mykid-kindergarten-events.md

**Interfaces:**
- Consumes: Browserless function, child external key, PostgreSQL ingestion credential.
- Produces: idempotent validated kindergarten_events rows.

- [ ] **Step 1: Add Manual Trigger and inactive schedules**

Add 08:00 and 18:00 schedules in local timezone, both routed through one validation pipeline.

- [ ] **Step 2: Write and run failing validation input**

    {"status":"ok","events":[{"source_key":"fixture-1","title":"Foreldremøte","date":"2026-09-09","start_time":"17:30","end_time":"19:00","details":"Kort tekst"}]}

Reject non-ok status, over 50 records, missing source_key/title/date, invalid date, and invalid time. Expected initially: failing workflow, no database output.

- [ ] **Step 3: Add Browserless function request**

POST application/javascript to private Browserless function endpoint using n8n credential token. Function behavior:
1. Navigate MyKid parent page with 45-second timeout.
2. Return session_expired when authenticated navigation absent.
3. Locate exact upcoming-events heading and table.
4. Return source_changed when either is absent.
5. Return only source key, title, Norwegian date/time text, optional details, and fetched timestamp.

Use live semantic selectors confirmed during bootstrap. Do not return page HTML or commit actual event content.

- [ ] **Step 4: Add parameterized upsert**

    WITH target_person AS (
      SELECT person_id FROM people WHERE external_key = $1
    )
    INSERT INTO kindergarten_events
      (person_id, source_key, title, event_date, start_time, end_time, details, last_seen_at)
    SELECT person_id, $2, $3, $4::date, NULLIF($5, '')::time,
      NULLIF($6, '')::time, NULLIF($7, ''), now()
    FROM target_person
    ON CONFLICT (person_id, source_key) DO UPDATE SET
      title = EXCLUDED.title, event_date = EXCLUDED.event_date,
      start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
      details = EXCLUDED.details, last_seen_at = EXCLUDED.last_seen_at;

Fail if child key has no person. Retain no successful execution data and failed executions for fourteen days.

- [ ] **Step 5: Verify idempotency, activate, and commit**

Run same successful data twice. Expected: one row per source key.

    git add n8n/mykid-import-kindergarten-events.json docs/n8n-mykid-kindergarten-events.md
    git commit -m "feat: import MyKid kindergarten events"

### Task 4: Create publisher workflow

**Files:**
- Create: n8n/mykid-publish-kindergarten-events.json
- Modify: docs/n8n-mykid-kindergarten-events.md

**Interfaces:**
- Consumes: kindergarten_events and Home Assistant credential.
- Produces: sensor state with summary, source_updated_at, events.

- [ ] **Step 1: Add manual and inactive 15-minute triggers**

Use restricted PostgreSQL read credential.

- [ ] **Step 2: Add publisher query**

    SELECT json_build_object(
      'events', COALESCE(json_agg(json_build_object(
        'date', event_date, 'title', title, 'details', details
      ) ORDER BY event_date, start_time NULLS LAST, title), '[]'::json),
      'source_updated_at', max(last_seen_at)
    ) AS data
    FROM kindergarten_events e JOIN people p ON p.person_id = e.person_id
    WHERE p.external_key = $1 AND e.event_date >= current_date
      AND e.last_seen_at >= now() - interval '3 days';

- [ ] **Step 3: Format and publish**

Formatter returns Norwegian empty or count summary, optional source_updated_at, and events. POST it with existing Home Assistant bearer credential to configured sensor endpoint. Test empty and one-event output, then activate.

- [ ] **Step 4: Commit**

    git add n8n/mykid-publish-kindergarten-events.json docs/n8n-mykid-kindergarten-events.md
    git commit -m "feat: publish kindergarten events to Home Assistant"

### Task 5: Add WallDash contract and slide

**Files:**
- Modify: src/shared/entities.ts
- Modify: src/server/index.ts
- Modify: src/server/homeAssistant.test.ts
- Modify: src/client/dashboardModel.ts
- Modify: src/client/weeklyPlan.test.ts
- Modify: src/client/App.tsx
- Modify: src/client/App.test.tsx

**Interfaces:**
- Consumes: sensor summary, source_updated_at, events.
- Produces: kindergartenEvents dashboard state and third accessible carousel slide.

- [ ] **Step 1: Write failing tests**

Test parser with one event and unavailable state. Test carousel button labelled Vis barnehagehendelser, empty state, and unavailable state.

    npm.cmd test -- src/client/weeklyPlan.test.ts src/server/homeAssistant.test.ts src/client/App.test.tsx

Expected: failure because state key, parser, and slide do not exist.

- [ ] **Step 2: Implement state contract and parser**

Add kindergartenEvents to dashboardStateKeys and default entity IDs. Add snapshot type with summary, optional source_updated_at, and JacobPlanItem events. Resolve HA_KINDERGARTEN_EVENTS_ENTITY_ID in server index. Add defensive parser using current stateValue, planText, and planItems helpers.

- [ ] **Step 3: Implement carousel extension**

Add third slide with preview maximum three sorted events and detail dialog heading Barnehagehendelser. Close label is Lukk barnehagehendelser. Reuse existing event date/time and chronological render helpers instead of copying Jacob renderer.

- [ ] **Step 4: Verify and commit**

    npm.cmd test
    npm.cmd run build

Expected: pass, with calendar and Jacob behavior unchanged.

    git add src/shared/entities.ts src/server/index.ts src/server/homeAssistant.test.ts src/client/dashboardModel.ts src/client/weeklyPlan.test.ts src/client/App.tsx src/client/App.test.tsx
    git commit -m "feat: show kindergarten events in dashboard"

### Task 6: Verify recovery and privacy

**Files:**
- Modify: docs/n8n-mykid-kindergarten-events.md

- [ ] **Step 1: Test session expiry**

Use non-authenticated test profile. Expected: import writes no data, publisher preserves recent confirmed events, and private recovery notification appears.

- [ ] **Step 2: Test stale data and data minimization**

Run duplicate source input, then a successful response without one item. Expected: no duplicates; publisher hides missing items after three-day grace. Inspect Browserless, n8n, database, and Home Assistant: only approved event fields remain.

- [ ] **Step 3: Final verification and recovery documentation**

    npm.cmd test
    npm.cmd run build
    git status --short

Expected: pass and no profile/secret tracked. Document recovery:
session_expired -> LAN-only debugger -> manual login -> remove debugger port -> manual import -> reactivate schedule.

- [ ] **Step 4: Commit operations documentation**

    git add docs/n8n-mykid-kindergarten-events.md
    git commit -m "docs: document MyKid event recovery"

## Plan self-review

- Tasks one and two cover storage and private Browserless; tasks three and four are the two workflows; task five is Home Assistant and WallDash; task six covers recovery and privacy.
- Image digest, IDs, child key, and credentials are deployment configuration never committed.
- Contract consistency: Browserless normalized events -> kindergarten_events -> Home Assistant summary/source_updated_at/events -> dashboard snapshot.

