# Klara weekly-plan ingestion: Phase 1 design

**Status:** Approved for implementation planning
**Date:** 2026-08-24
**Scope:** Store a school weekly plan and its source material safely. This phase does not add a dashboard view, AI chat, task creation, calendar writes, or automatic Gmail polling.

## Goal

Create a reliable first data source for Klara, the household's personal data and AI foundation.

The existing n8n workflow finds the newest email whose subject contains `Ukeplan for Jacob Trevland Ramstad`, downloads its PDF, extracts its text, and structures the contents. Phase 1 extends that workflow so the complete result is stored in the `klara-ai-master-database` stack.

The result must be useful later for a dashboard, AI questions, and approval-based task/calendar actions without needing to re-read the original email or PDF.

## Product principles

- Preserve the original PDF and the exact extracted text.
- Keep readable and AI-produced content in Norwegian.
- Store real-world data in purpose-built tables, not one generic catch-all table.
- Every stored item must trace back to its source weekly plan, email, and PDF.
- Use a controlled ingestion entrance; n8n must not have broad database access.
- Never create tasks or calendar events in this phase.
- Avoid duplicate imports when the same email or PDF is processed again.

## Architecture

```text
School email + PDF
       |
       v
n8n: find, download, extract, structure in Norwegian
       |
       v
Klara ingestion API (one protected weekly-plan submission route)
       |                         |
       v                         v
PostgreSQL                   private PDF file storage
structured records           original document
```

The PostgreSQL database is the catalogue and source of structured truth. A private file-storage service retains the original PDFs; PostgreSQL stores the metadata and a secure object reference, not the PDF bytes.

The future dashboard, AI, and other systems use a broader Klara data API. They do not connect directly to PostgreSQL. The Phase 1 ingestion API is the first, deliberately narrow part of that API.

## Data ownership and source traceability

Phase 1 is household-oriented and links every weekly plan to a person, initially Jacob. It stores only the source information required for traceability and duplicate prevention:

- Gmail message ID and thread ID;
- email subject and received time;
- attachment filename, MIME type, byte size, and checksum;
- original PDF and extracted text.

Do not retain unnecessary raw Gmail headers, recipient lists, or email body content.

## PostgreSQL tables

Technical table and column names use `snake_case` English. All human-readable values placed in the tables are Norwegian, except for the original source content which is retained exactly as received.

### Shared foundation

| Table | Purpose | Key fields |
|---|---|---|
| `households` | Household ownership boundary | `household_id`, `name`, `created_at` |
| `people` | Household members | `person_id`, `household_id`, `display_name`, `created_at` |
| `source_emails` | Minimal email traceability | `source_email_id`, `household_id`, `provider`, `provider_message_id`, `provider_thread_id`, `subject`, `received_at` |
| `stored_files` | Metadata for a privately stored original file | `stored_file_id`, `household_id`, `storage_key`, `file_name`, `mime_type`, `byte_size`, `sha256`, `created_at` |

`source_emails` has a unique constraint on `(provider, provider_message_id)`. `stored_files` has a unique checksum constraint scoped to the household. These provide the first duplicate safeguards.

### Weekly-plan records

| Table | Purpose | Key fields |
|---|---|---|
| `weekly_plans` | One imported school plan | `weekly_plan_id`, `person_id`, `source_email_id`, `stored_file_id`, `title`, `plan_week_start`, `extracted_text`, `normalized_markdown`, `processing_status`, `created_at` |
| `weekly_plan_homework` | One homework entry | `homework_id`, `weekly_plan_id`, `subject`, `task`, `due_date`, `due_date_text`, `evidence_text` |
| `weekly_plan_events` | One dated school event | `event_id`, `weekly_plan_id`, `title`, `event_date`, `date_text`, `start_time`, `end_time`, `details`, `evidence_text` |
| `weekly_plan_reminders` | One practical reminder | `reminder_id`, `weekly_plan_id`, `reminder`, `reminder_date`, `date_text`, `evidence_text` |
| `weekly_plan_topics` | One subject/topic entry | `topic_id`, `weekly_plan_id`, `subject`, `topic`, `evidence_text` |
| `weekly_plan_messages` | One general message to home | `message_id`, `weekly_plan_id`, `message`, `evidence_text` |
| `weekly_plan_schedule` | School times for a weekday in this plan | `schedule_id`, `weekly_plan_id`, `weekday`, `start_time`, `end_time` |

Every child table has a foreign key to `weekly_plans` and an index on that foreign key. `weekly_plan_schedule` has one unique row per `(weekly_plan_id, weekday)`.

Use `date` for date-only deadlines, `time` for daily school times, and `timestamptz` for actual received/created timestamps. Store the original Norwegian date phrase whenever a definite date cannot be safely determined. Core relations belong in columns and tables; raw AI output may be retained separately as JSONB for debugging only, not used as the primary query model.

### Status values

`processing_status` is text constrained to these initial values:

- `received` — accepted but not fully processed;
- `processed` — source and structured data were saved;
- `needs_review` — preserved but one or more fields could not be safely normalised;
- `failed` — an attempted import did not complete.

## Norwegian n8n delivery contract

The n8n AI step must output Norwegian for all human-readable generated fields. It must retain the original source wording in `evidence_text`.

It sends one weekly-plan submission package containing:

```text
person: Jacob
source: Gmail message ID, thread ID, subject, received time
file: filename, MIME type, size, SHA-256 checksum, PDF bytes
original: extracted Norwegian text
structured: title, Markdown summary, homework[], events[], reminders[], topics[], messages[], school_schedule[]
```

Representative homework item:

```json
{
  "subject": "Engelsk",
  "task": "Les teksten i den hvite leksemappen sammen hjemme.",
  "due_date": "2026-08-28",
  "due_date_text": "Fredag 28.08.2026",
  "evidence_text": "Original Norwegian wording from the PDF"
}
```

Date rule:

- Send `YYYY-MM-DD` only when the date can be determined with confidence from the plan context.
- Otherwise send `null` for the date and retain the Norwegian source phrase in `*_date_text`.
- Do not invent missing dates or times.

The current n8n output already contains homework, events, reminders, topics, and messages. It must be updated to add `school_schedule`, consistent Norwegian Markdown, ISO date fields, original date-text fields, and the source/file metadata needed by the API.

## Controlled ingestion and security

The ingestion API exposes one authenticated endpoint for this phase: submit a weekly plan. It validates the complete package, uploads the PDF to private file storage, and inserts all database rows in one transaction.

- n8n uses a single delivery credential with permission only for this endpoint.
- n8n does not receive the PostgreSQL owner credential.
- The PDF storage service and PostgreSQL remain private Docker-network services with persistent volumes.
- Credentials are held in Portainer/n8n, never browser-delivered dashboard code.

If validation, file storage, or any database insert fails, the API reports the failure and does not leave a partially saved plan.

## Duplicate and correction behaviour

- Reprocessing the same Gmail message is idempotent: it returns the existing weekly plan rather than creating a second copy.
- Reprocessing the same PDF is additionally caught by the file checksum.
- A genuinely corrected plan from a new email is stored as a new plan and remains independently traceable to its original source.
- Ambiguous data is retained with `needs_review`; it is not silently discarded.

## Delivery sequence

1. Add private, persistent PDF storage to the `klara-ai-master-database` Portainer stack.
2. Apply the PostgreSQL schema, constraints, indexes, and a restricted ingestion role.
3. Deploy the small protected Klara ingestion API.
4. Update the n8n structured-output contract to Norwegian and add the package-building and delivery steps.
5. Run one real weekly plan through the workflow and verify PDF retention, table rows, Norwegian content, source traceability, and idempotent re-run behaviour.
6. Keep the workflow manual until several imports are verified. Automatic Gmail polling is a separate decision.

## Out of scope for Phase 1

- Dashboard UI for school plans.
- AI chat or retrieval/embeddings.
- Task or calendar creation.
- Automatic approval or external actions.
- Home Assistant ingestion.
- Automated Gmail schedule/polling.

## Future direction

Other data sources will reuse the shared household, source, file, and controlled-ingestion principles, but each real-world domain receives dedicated tables. Home Assistant sensor telemetry, for example, should not be forced into the weekly-plan schema. This preserves clear queries and traceability as Klara grows.
