# Klara Weekly-Plan Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each processed Jacob weekly-plan PDF and its Norwegian structured contents through a protected ingestion API into the Klara master database.

**Architecture:** Extend the existing `klara-ai-master-database` Portainer stack with private MinIO PDF storage and a small Node/TypeScript ingestion API. n8n sends a single authenticated multipart weekly-plan package to that API; the API validates it, writes the original PDF to MinIO, and writes all normalized PostgreSQL records in one transaction.

**Tech Stack:** PostgreSQL 17 with pgvector/pgcrypto, MinIO (S3-compatible private object storage), Node.js 22, TypeScript, Express, Zod, Multer, `pg`, AWS SDK S3 client, Vitest, Supertest, n8n.

**Spec:** `docs/superpowers/specs/2026-08-24-klara-weekly-plan-ingestion-design.md`

## Global Constraints

- Keep this Phase 1 to storage and ingestion only: no dashboard UI, AI chat, calendar/task integration, or automatic Gmail polling.
- All generated, human-readable fields saved by the workflow must be Norwegian; preserve original source wording as evidence.
- Keep original PDFs in private MinIO storage, not `bytea` PostgreSQL columns.
- Do not expose PostgreSQL, MinIO, or the ingestion API publicly; use the `klara-ai-data` Docker network.
- Attach the existing n8n service to `klara-ai-data` as an additional external network so it can reach the private API by service name.
- Store every secret only as a Portainer stack environment variable or n8n credential; never commit a secret.
- n8n must authenticate to the API but must not receive a PostgreSQL credential.
- Preserve existing `klara-ai-master-database` stack environment variables when updating it through Portainer MCP.
- Use `timestamptz` for instants, `date` for dates, `time` for daily times, `text` for strings, and `uuid` identifiers because these IDs cross services.
- Retain an ambiguous Norwegian date phrase in `*_date_text`; never invent a concrete date.

---

## File Structure

| File | Responsibility |
|---|---|
| `infrastructure/klara-ai-master-database/docker-compose.yml` | Version-controlled Portainer stack definition for PostgreSQL, MinIO, bucket/user bootstrap, schema migration, and ingestion API. |
| `infrastructure/klara-ai-master-database/.env.example` | Names and non-secret examples for required Portainer variables. |
| `database/migrations/001_weekly_plan_ingestion.sql` | Extensions, roles, tables, constraints, indexes, and grants. |
| `database/tests/001_weekly_plan_ingestion.sql` | SQL assertions run against the deployed migration in a disposable database. |
| `services/klara-ingestion-api/package.json` | Isolated API dependencies and scripts. |
| `services/klara-ingestion-api/Dockerfile` | Reproducible Node 22 production image. |
| `services/klara-ingestion-api/src/contracts.ts` | Zod request contract and exported TypeScript types. |
| `services/klara-ingestion-api/src/app.ts` | Health route and authenticated multipart submission route. |
| `services/klara-ingestion-api/src/ingest.ts` | S3 upload plus transactional PostgreSQL persistence and idempotency. |
| `services/klara-ingestion-api/src/index.ts` | Environment validation and production wiring. |
| `services/klara-ingestion-api/src/app.test.ts` | HTTP authentication and validation tests. |
| `services/klara-ingestion-api/src/ingest.test.ts` | Persistence/idempotency unit tests using injected storage/database fakes. |
| `docs/klara-weekly-plan-ingestion-operations.md` | Runbook: required credentials, manual test, duplicate test, and recovery. |

## Submission Interface

`POST /v1/weekly-plans` is `multipart/form-data` with:

- header: `X-Klara-Ingestion-Key: <secret>`;
- field `payload`: JSON text conforming to `WeeklyPlanSubmission` below;
- field `document`: exactly one `application/pdf` file, maximum 15 MiB.

```ts
export type WeeklyPlanSubmission = {
  person: { external_key: 'jacob'; display_name: string };
  source: {
    provider: 'gmail'; message_id: string; thread_id?: string;
    subject: string; received_at: string;
  };
  plan: {
    title: string; plan_week_start: string | null;
    extracted_text: string; normalized_markdown: string;
  };
  homework: Array<{ subject: string; task: string; due_date: string | null; due_date_text: string | null; evidence_text: string }>;
  events: Array<{ title: string; event_date: string | null; date_text: string | null; start_time: string | null; end_time: string | null; details: string; evidence_text: string }>;
  reminders: Array<{ reminder: string; reminder_date: string | null; date_text: string | null; evidence_text: string }>;
  topics: Array<{ subject: string; topic: string; evidence_text: string }>;
  messages: Array<{ message: string; evidence_text: string }>;
  school_schedule: Array<{ weekday: number; start_time: string; end_time: string }>;
};
```

Successful first delivery returns `201 { weekly_plan_id, import_status: 'created' }`. A repeat of the same Gmail message returns `200 { weekly_plan_id, import_status: 'duplicate' }` without adding records.

### Task 1: Capture the Portainer stack as deployable infrastructure

**Files:**
- Create: `infrastructure/klara-ai-master-database/docker-compose.yml`
- Create: `infrastructure/klara-ai-master-database/.env.example`
- Create: `docs/klara-weekly-plan-ingestion-operations.md`

**Interfaces:**
- Produces the private services `klara-postgres`, `klara-files`, `klara-files-init`, `klara-schema-migrate`, and `klara-ingestion-api` on `klara-ai-data`.
- Consumes only Portainer environment variables named in `.env.example`.

- [ ] **Step 1: Record the existing deployed stack without changing it**

Use Portainer MCP to rediscover environment `3` and stack `klara-ai-master-database`; export its current Compose and environment-variable names. Confirm the PostgreSQL image remains `pgvector/pgvector:0.8.6-pg17-bookworm`, the database is `klara_ai`, and the existing data volume is preserved.

- [ ] **Step 2: Write the failing deployment acceptance checklist**

Add this checklist to `docs/klara-weekly-plan-ingestion-operations.md`:

```markdown
## Deployment acceptance

- `klara-postgres`, `klara-files`, and `klara-ingestion-api` report healthy.
- No service publishes ports for PostgreSQL, MinIO, or the ingestion API.
- `klara-files-init` and `klara-schema-migrate` exit with code 0.
- The bucket `weekly-plan-source-files` exists and is private.
```

- [ ] **Step 3: Create the stack definition and non-secret variable template**

Define persistent named volumes `klara-ai-master-postgres-data` and `klara-ai-master-files-data`. Add MinIO with command `server /data --console-address ':9001'`, no `ports`, and an internal health check. Add a one-shot MinIO Client service that creates `weekly-plan-source-files` and an API-only MinIO user with `s3:PutObject` permission for that bucket. Add a one-shot migration service that waits for PostgreSQL health and runs `psql -v ON_ERROR_STOP=1 -f /migrations/001_weekly_plan_ingestion.sql`.

The template lists only these names, with placeholder values:

```dotenv
POSTGRES_PASSWORD=replace-with-generated-secret
MINIO_ROOT_USER=replace-with-admin-name
MINIO_ROOT_PASSWORD=replace-with-generated-secret
KLARA_FILES_ACCESS_KEY=replace-with-api-access-key
KLARA_FILES_SECRET_KEY=replace-with-generated-secret
KLARA_INGESTION_API_KEY=replace-with-generated-secret
```

- [ ] **Step 4: Verify the stack definition before deploying**

Run: `docker compose -f infrastructure/klara-ai-master-database/docker-compose.yml config`

Expected: Compose expands successfully without an exposed `ports:` section for the private services.

- [ ] **Step 5: Commit the infrastructure source**

```bash
git add infrastructure/klara-ai-master-database docs/klara-weekly-plan-ingestion-operations.md
git commit -m "infra: define Klara weekly-plan ingestion stack"
```

### Task 2: Define and prove the PostgreSQL schema

**Files:**
- Create: `database/migrations/001_weekly_plan_ingestion.sql`
- Create: `database/tests/001_weekly_plan_ingestion.sql`

**Interfaces:**
- Produces `weekly_plans` and all tables listed in the approved spec.
- Produces role `klara_ingestion_api`, granted only table DML, sequence usage, and schema usage.
- Consumed by `KlaraWeeklyPlanIngestor.persist()` in Task 4.

- [ ] **Step 1: Write failing SQL assertions**

Create assertions that fail unless these constraints exist: one person external key per household, one Gmail provider-message ID, one file checksum per household, one plan per source email, one schedule row per plan/day, and foreign-key indexes on every weekly-plan child table. Use `to_regclass`, `pg_constraint`, and `pg_indexes`; finish with:

```sql
DO $$ BEGIN
  RAISE NOTICE 'weekly-plan schema assertions passed';
END $$;
```

- [ ] **Step 2: Run the assertions before the migration**

Run in a disposable PostgreSQL 17 container with the test file mounted.

Expected: FAIL because `weekly_plans` does not exist.

- [ ] **Step 3: Write the migration**

Enable `pgcrypto`; create `households`, `people`, `source_emails`, `stored_files`, `weekly_plans`, `weekly_plan_homework`, `weekly_plan_events`, `weekly_plan_reminders`, `weekly_plan_topics`, `weekly_plan_messages`, and `weekly_plan_schedule`.

Use `uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `timestamptz NOT NULL DEFAULT now()` for creation instants, and the exact typed columns from the Submission Interface. Add `people.external_key TEXT NOT NULL`, `UNIQUE (household_id, external_key)`, `CHECK` constraints for `provider = 'gmail'`, status values `received|processed|needs_review|failed`, weekday `1..7`, and non-negative `byte_size`. Add explicit indexes for every FK and `UNIQUE (weekly_plan_id, weekday)` for schedules.

Create `klara_ingestion_api` as `NOLOGIN`; revoke public schema creation; grant it `USAGE` on schema, `SELECT, INSERT, UPDATE` on the Phase 1 tables, and `USAGE, SELECT` on their sequences. Do not create an n8n database role.

- [ ] **Step 4: Re-run migration and assertions**

Run:

```bash
docker run --rm -e POSTGRES_PASSWORD=test -d --name klara-schema-test -p 55432:5432 pgvector/pgvector:0.8.6-pg17-bookworm
psql "postgresql://postgres:test@127.0.0.1:55432/postgres" -v ON_ERROR_STOP=1 -f database/migrations/001_weekly_plan_ingestion.sql
psql "postgresql://postgres:test@127.0.0.1:55432/postgres" -v ON_ERROR_STOP=1 -f database/tests/001_weekly_plan_ingestion.sql
```

Expected: all assertions pass. Remove only the explicitly named `klara-schema-test` container after the test.

- [ ] **Step 5: Commit the schema**

```bash
git add database/migrations/001_weekly_plan_ingestion.sql database/tests/001_weekly_plan_ingestion.sql
git commit -m "feat: add Klara weekly-plan schema"
```

### Task 3: Build the authenticated HTTP contract

**Files:**
- Create: `services/klara-ingestion-api/package.json`
- Create: `services/klara-ingestion-api/tsconfig.json`
- Create: `services/klara-ingestion-api/src/contracts.ts`
- Create: `services/klara-ingestion-api/src/app.ts`
- Create: `services/klara-ingestion-api/src/app.test.ts`

**Interfaces:**
- Produces `createApp(deps): Express` and `WeeklyPlanSubmissionSchema`.
- Consumes `WeeklyPlanIngestor.ingest(submission, pdf)` from Task 4.

- [ ] **Step 1: Write failing HTTP tests**

Use Supertest multipart requests to assert: missing/wrong `X-Klara-Ingestion-Key` returns 401; missing `payload`, invalid JSON, non-PDF, PDF over 15 MiB, invalid ISO date, English-only placeholder text, and duplicate weekday return 400; valid Norwegian payload plus PDF returns 201.

Use this valid minimal fixture:

```ts
const payload = {
  person: { external_key: 'jacob', display_name: 'Jacob' },
  source: { provider: 'gmail', message_id: 'gmail-1', subject: 'Ukeplan', received_at: '2026-08-24T20:00:00.000Z' },
  plan: { title: 'Ukeplan', plan_week_start: '2026-08-24', extracted_text: 'Norsk kildetekst', normalized_markdown: '# Ukeplan' },
  homework: [], events: [], reminders: [], topics: [], messages: [], school_schedule: [],
};
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run src/app.test.ts` from `services/klara-ingestion-api`.

Expected: FAIL because the application does not exist.

- [ ] **Step 3: Implement the contract and route**

Install `express`, `multer`, `zod`, `pg`, and `@aws-sdk/client-s3`; add TypeScript, Vitest, Supertest, and their types for development. Set Multer memory storage with `limits: { fileSize: 15 * 1024 * 1024, files: 1 }` and `single('document')`. Require `application/pdf`, parse only `payload`, and validate with Zod.

Reject empty generated fields and explicit placeholder markers; language detection is not reliable enough to enforce at the API boundary. n8n is responsible for producing Norwegian. Export:

```ts
export interface WeeklyPlanIngestor {
  ingest(input: WeeklyPlanSubmission, document: { bytes: Buffer; fileName: string; mimeType: 'application/pdf' }): Promise<{ weeklyPlanId: string; importStatus: 'created' | 'duplicate' }>;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run src/app.test.ts && npm run build`

Expected: all route tests pass and TypeScript emits no errors.

- [ ] **Step 5: Commit the HTTP contract**

```bash
git add services/klara-ingestion-api/package.json services/klara-ingestion-api/package-lock.json services/klara-ingestion-api/tsconfig.json services/klara-ingestion-api/src/contracts.ts services/klara-ingestion-api/src/app.ts services/klara-ingestion-api/src/app.test.ts
git commit -m "feat: add Klara weekly-plan ingestion endpoint"
```

### Task 4: Implement file retention, transactions, and idempotency

**Files:**
- Create: `services/klara-ingestion-api/src/ingest.ts`
- Create: `services/klara-ingestion-api/src/ingest.test.ts`
- Modify: `services/klara-ingestion-api/src/app.ts`

**Interfaces:**
- Produces `createWeeklyPlanIngestor({ pool, storage, householdId }): WeeklyPlanIngestor`.
- Consumes a PostgreSQL `Pool` and an S3 `PutObject` adapter.

- [ ] **Step 1: Write failing persistence tests**

Create fakes that record SQL transaction boundaries and uploaded object keys. Assert that a first ingestion: computes SHA-256 from the PDF bytes; uploads to `households/<householdId>/weekly-plans/<sha256>.pdf`; inserts one source email, file, plan, and child rows; commits only after every insert succeeds. Assert the same `provider + message_id` returns `duplicate`, does not upload again, and adds no child rows. Assert a failing child insert triggers `ROLLBACK`.

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm test -- --run src/ingest.test.ts`

Expected: FAIL because `createWeeklyPlanIngestor` does not exist.

- [ ] **Step 3: Implement idempotent persistence**

Begin a PostgreSQL transaction. Look up the household's `people.external_key = 'jacob'`; fail with a server configuration error if it is missing. Insert `source_emails` with `ON CONFLICT (provider, provider_message_id) DO NOTHING RETURNING source_email_id`. When no row is returned, select the existing `weekly_plans.weekly_plan_id` by the existing source email, rollback, and return `duplicate`.

For a new email, calculate `createHash('sha256').update(bytes).digest('hex')`, upload the PDF using that checksum key, insert `stored_files`, then `weekly_plans` with status `processed`, then all child rows with parameterized `pg` queries. Commit and return `created`. If any database statement fails, rollback. If upload succeeds but the database transaction fails, delete that exact newly-uploaded object before surfacing the error. Never log the ingestion key, PDF bytes, or source text.

- [ ] **Step 4: Run unit tests and full API suite**

Run: `npm test && npm run build`

Expected: all API tests pass, including the rollback and duplicate cases.

- [ ] **Step 5: Commit persistence**

```bash
git add services/klara-ingestion-api/src/ingest.ts services/klara-ingestion-api/src/ingest.test.ts services/klara-ingestion-api/src/app.ts
git commit -m "feat: persist Klara weekly plans idempotently"
```

### Task 5: Wire the production service and deploy it privately

**Files:**
- Create: `services/klara-ingestion-api/src/index.ts`
- Create: `services/klara-ingestion-api/Dockerfile`
- Modify: `infrastructure/klara-ai-master-database/docker-compose.yml`
- Modify: `docs/klara-weekly-plan-ingestion-operations.md`

**Interfaces:**
- Produces container health endpoint `GET /health` and private service DNS name `klara-ingestion-api:3000`.
- Consumes the migration, MinIO credentials, PostgreSQL service, and ingestion API key from Task 1/2.

- [ ] **Step 1: Write a failing container smoke check**

Add an operations-runbook command that must eventually return HTTP 200 from inside the Docker network:

```bash
docker exec klara-ingestion-api node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.status === 200 ? 0 : 1))"
```

- [ ] **Step 2: Implement environment wiring**

`index.ts` must require `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `KLARA_INGESTION_API_KEY`, and `KLARA_HOUSEHOLD_ID`; it creates a `pg.Pool`, S3 client with path-style enabled, and the ingestor. `Dockerfile` must use a multi-stage Node 22 build, run `npm ci`, `npm run build`, then run the built server as a non-root user.

In Compose, make the API wait for healthy PostgreSQL and successful migration. Give it no published port. Use `http://klara-files:9000` as its S3 endpoint and only the limited MinIO user credentials.

- [ ] **Step 3: Run local container smoke check**

Build the API image and start it with a disposable PostgreSQL/MinIO Compose project using generated test-only environment values.

Expected: health endpoint returns 200 inside the API container; the host has no listener for Postgres, MinIO, or API.

- [ ] **Step 4: Deploy through Portainer MCP**

Rediscover Portainer environment and the `klara-ai-master-database` stack immediately before mutation. Preserve all existing environment variables, add the five new secret variables as freshly generated values, and update only this stack. Then rediscover the n8n stack, preserve its existing configuration, and attach only the n8n service to the external `klara-ai-data` network. Do not deploy `homeassistant-wall-dashboard`.

- [ ] **Step 5: Verify deployed services and schema**

Use Portainer MCP to confirm healthy PostgreSQL, MinIO, and API; confirm both one-shot services exited successfully. From the private API container, call `/health`; from the PostgreSQL container, query `weekly_plans` and confirm it exists. Record only status/results, never secrets, in the runbook.

- [ ] **Step 6: Commit production wiring**

```bash
git add services/klara-ingestion-api/src/index.ts services/klara-ingestion-api/Dockerfile infrastructure/klara-ai-master-database/docker-compose.yml docs/klara-weekly-plan-ingestion-operations.md
git commit -m "infra: deploy private Klara ingestion service"
```

### Task 6: Update n8n to deliver the Norwegian weekly-plan package

**Files:**
- Modify: n8n workflow `EzhkAJXwqn6mgptN` (`Klara – Capture latest Jacob weekly plan PDF`)
- Modify: `docs/klara-weekly-plan-ingestion-operations.md`

**Interfaces:**
- Consumes `POST http://klara-ingestion-api:3000/v1/weekly-plans` from Task 5.
- Produces a manual end-to-end import and a verified duplicate response.

- [ ] **Step 1: Back up and validate the current workflow**

Use n8n MCP to fetch the workflow in full and validate it before editing. Save its current version through n8n workflow versioning. Confirm it still contains the Gmail query, PDF filter, PDF text extraction, AI information extractor, and OpenAI model connection.

- [ ] **Step 2: Update the structured-output schema and Norwegian instructions**

In `Structure weekly plan for AI`, replace the current fields with `title`, `plan_week_start`, `extracted_text`, `normalized_markdown`, `homework`, `events`, `reminders`, `topics`, `messages`, and `school_schedule` matching the Submission Interface exactly. Require all generated strings in Norwegian. Require `YYYY-MM-DD` for confidently resolved dates, `HH:MM` for known daily times, and the exact Norwegian source phrase in the accompanying text field whenever date/time is unknown. Do not allow fabricated dates.

Add `school_schedule` entries as `{ weekday: 1..5, start_time: 'HH:MM', end_time: 'HH:MM' }`.

- [ ] **Step 3: Add file checksum and request-building nodes**

After `Keep PDF attachment`, add an n8n **Crypto** node configured to hash binary property `weekly_plan_0` with `SHA256`, output property `pdf_sha256`, encoding `HEX`. Add a Set/Code node that builds the `payload` JSON from the original Gmail message fields, extracted text, AI structured output, and `pdf_sha256`; preserve the original binary property `weekly_plan_0`.

- [ ] **Step 4: Add the authenticated multipart delivery node**

Create a dedicated n8n HTTP Header Auth credential named `Klara weekly-plan ingestion` containing `X-Klara-Ingestion-Key`. Add an HTTP Request node:

```text
Method: POST
URL: http://klara-ingestion-api:3000/v1/weekly-plans
Body Content Type: Form-Data
Field payload: JSON string from the package-builder node
Field document: binary property weekly_plan_0
```

Set the node to fail on non-2xx responses. Do not place the credential value in the workflow JSON.

- [ ] **Step 5: Validate and run a manual real-document test**

Validate the workflow with n8n MCP. Run it manually from n8n once. Confirm the API response is `201` with `import_status: created`; use the private PostgreSQL container to verify exactly one plan row and the expected number of child rows; use MinIO client to verify the PDF object exists. Verify stored generated fields are Norwegian and the source evidence is retained.

- [ ] **Step 6: Prove duplicate handling**

Run the same workflow again without changing the email. Confirm the API response is `200` with `import_status: duplicate`, and PostgreSQL child-table counts have not increased.

- [ ] **Step 7: Update the runbook and commit workflow documentation**

Record the exact manual validation commands, the expected `created`/`duplicate` responses, and recovery procedure: leave the workflow manual and investigate any `needs_review` or failed execution without deleting the original source.

```bash
git add docs/klara-weekly-plan-ingestion-operations.md
git commit -m "docs: document Klara weekly-plan ingestion validation"
```

## Final Verification

- [ ] Run `npm test && npm run build` inside `services/klara-ingestion-api`.
- [ ] Run the migration and `database/tests/001_weekly_plan_ingestion.sql` against a clean disposable PostgreSQL instance.
- [ ] Confirm deployed Portainer services are healthy and private.
- [ ] Confirm one manual n8n run creates one full plan and retains the PDF.
- [ ] Confirm a second identical run returns `duplicate` and creates no extra rows.
- [ ] Confirm no dashboard code, Home Assistant integration, task/calendar integration, or Gmail polling was changed.
