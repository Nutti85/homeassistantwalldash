# Klara weekly-plan ingestion handoff

**Date:** 2026-08-25  
**Goal:** Store the existing n8n school weekly-plan PDF data in the `klara-ai-master-database` PostgreSQL database, retaining the original PDF.

## Final architecture decision

Use the simpler direct path for this first use case:

```text
n8n → restricted PostgreSQL role → weekly-plan tables
    → restricted MinIO credentials → original PDF storage
```

Do **not** deploy the previously planned ingestion API. An API remains a future option when the dashboard and AI need a controlled read/write interface.

## Safety boundaries

- Existing dashboard work on `main` is user-owned and must remain untouched.
- Klara implementation work is in the isolated worktree:
  `C:\Code\Homeassistant WallDash\.worktrees\codex\klara-weekly-plan-ingestion`
- Branch: `codex/klara-weekly-plan-ingestion`.
- Do not expose or repeat credentials from Portainer/n8n in chat, logs, commits, or documentation.
- Production changes must use Portainer MCP. Rediscover environment and stack IDs before every mutation.
- The only production stack to update is `klara-ai-master-database` (currently local stack ID `105`, environment ID `3`). Do not update `homeassistant-wall-dashboard`.
- n8n stack is local stack ID `10`; preserve its existing environment variables.

## Completed and committed

| Commit | Result |
|---|---|
| `f3ee647` | Original weekly-plan design specification |
| `090e525` | Original implementation plan |
| `166dc21` | Private database/MinIO infrastructure source and runbook |
| `140efdf` | Healthcheck correction |
| `183be67` | Least-privilege clarification |
| `3ec4239` | PostgreSQL weekly-plan schema |
| `782de37` | Tighter role grants and SQL assertions |
| `abbf6cd` | PostgreSQL assertion reserved-word fix |
| `1275580` | Direct n8n architecture: API removed from committed design/Compose source |

### PostgreSQL schema verification

The migration and full assertion script were successfully tested against an isolated temporary `pgvector/pgvector:0.8.6-pg17-bookworm` PostgreSQL 17 stack in Portainer. The temporary test stack was deleted afterwards. No production schema/data was changed by this test.

Tables defined by `database/migrations/001_weekly_plan_ingestion.sql`:

- `households`, `people`, `source_emails`, `stored_files`, `weekly_plans`
- `weekly_plan_homework`, `weekly_plan_events`, `weekly_plan_reminders`
- `weekly_plan_topics`, `weekly_plan_messages`, `weekly_plan_schedule`

It creates the restricted login role `klara_ingestion_api`. Despite its legacy name, this is now the direct n8n PostgreSQL role; n8n must receive its password, while it must never receive the database owner password.

## Existing n8n workflow

- Workflow ID: `EzhkAJXwqn6mgptN`
- Name: `Klara – Capture latest Jacob weekly plan PDF`
- Current status: manual/inactive.
- It already finds the newest matching Gmail email, downloads its PDF, extracts text, and structures homework/events/reminders/topics/messages.

Required n8n changes:

1. Keep all generated human-readable fields in Norwegian.
2. Add consistent ISO date fields plus original Norwegian date text.
3. Add `school_schedule` output.
4. Add a Crypto node to SHA-256 hash binary property `weekly_plan_0`.
5. Upload the original PDF to the private MinIO bucket `weekly-plan-source-files` using restricted S3 credentials.
6. Use a PostgreSQL node with the restricted `klara_ingestion_api` credential to insert/upsert the source email, file metadata, weekly plan, and child records.
7. Use the Gmail message ID as the idempotency key; rerunning the same email must not create duplicate plan/items.

## Current live-state status

The live `klara-ai-master-database` stack currently still contains only its original PostgreSQL + pgvector initialization setup. It has **not** yet received MinIO, the migration service, or the schema.

Two Portainer update attempts were rejected before deployment:

1. Incorrect connector method alias — no mutation occurred.
2. Invalid generated YAML — Portainer returned a parse error before deployment. No containers/volumes/data were changed.

## Next steps (in order)

1. Read the committed direct infrastructure source:
   `infrastructure/klara-ai-master-database/docker-compose.yml`.
2. Build a Portainer-compatible Compose payload from it. Important: Portainer cannot mount local worktree migration files, so embed the verified migration in the one-shot migration service command (for example as Base64 decoded inside the container), or use another Portainer-supported config mechanism. Validate YAML before calling `updateLocalStack`.
3. Preserve existing stack environment values. Add fresh secret values only for:
   - `MINIO_ROOT_USER`
   - `MINIO_ROOT_PASSWORD`
   - `KLARA_FILES_ACCESS_KEY`
   - `KLARA_FILES_SECRET_KEY`
   - `KLARA_DATABASE_INGESTION_PASSWORD`
4. Deploy only stack `105` in environment `3`. Preserve volume `klara-ai-master-postgres-data`; add a new persistent MinIO volume. Do not publish PostgreSQL or MinIO ports.
5. Verify PostgreSQL and MinIO health, then ensure the one-shot file bootstrap and schema migration containers exit successfully. Seed `households` and `people` with the intended household and Jacob's stable `external_key` (`jacob`) using the owner credential inside the private PostgreSQL container.
6. Update n8n stack `10` to attach the n8n service to the external `klara-ai-data` network. Preserve every existing n8n environment variable.
7. Create restricted n8n credentials for PostgreSQL and S3/MinIO. Do not place secret values in workflow JSON.
8. Update workflow `EzhkAJXwqn6mgptN`, validate it, manually run it once, and verify all relevant rows and PDF object exist.
9. Run the same workflow again and prove no duplicate rows are created.

## Cleanup note

`services/klara-ingestion-api/` is untracked inside the isolated worktree. It is partial abandoned API work and is not committed or deployed. It may be removed later only after confirming it contains no user-owned files; it has no effect on production.

## Relevant documentation

- `docs/superpowers/specs/2026-08-24-klara-weekly-plan-ingestion-design.md`
- `docs/superpowers/plans/2026-08-24-klara-weekly-plan-ingestion.md`
- `docs/klara-weekly-plan-ingestion-operations.md`
