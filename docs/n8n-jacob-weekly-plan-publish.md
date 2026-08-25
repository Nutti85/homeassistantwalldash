# n8n: publish Jacob weekly plan

Workflow file: `n8n/klara-publish-jacob-weekly-plan.json`

The workflow reads the latest processed plan for `people.external_key = 'jacob'`, formats a compact Norwegian summary plus the complete structured snapshot, and writes it to Home Assistant as `sensor.jacob_weekly_plan`.

## Setup

1. Import the JSON into n8n.
2. Select the restricted Klara PostgreSQL read credential on `Load latest Jacob plan`.
3. Select the existing restricted Home Assistant credential on `Publish to Home Assistant`.
4. Set the Home Assistant base URL in n8n’s environment as `HA_URL` if it is not already available to the n8n instance.
5. Run manually once, inspect the Home Assistant entity, then activate the 15-minute schedule.

The workflow does not insert or update Klara rows, so rerunning it cannot duplicate plans or child records. The source PDF and large extracted text remain in Klara’s private database/object storage.

## Database result shape

The PostgreSQL node returns one JSON object with `plan`, `homework`, `events`, `reminders`, `topics`, `messages`, and `schedule` properties. The child properties are JSON arrays. The query uses `json_build_object` and `coalesce(..., '[]'::json)` so an empty child table is a valid result.

## Home Assistant contract

The HTTP Request node calls `POST {{$env.HA_URL}}/api/states/sensor.jacob_weekly_plan` with the Code node’s `{ state, attributes }` object. `attributes` contains `summary`, ISO `week_start`/`week_end` where known, `source_updated_at`, `plan_id`, and the complete `events`, `reminders`, `homework`, `school_schedule`, `topics`, and `messages` collections. Human-readable fields are Norwegian; original readable date phrases are retained in `weekday` where supplied.

The WallDash card renders only `summary`, `events`, and `reminders`. The other attributes are intentionally available for future cards, automations, or inspection.

## Safety

Credentials are n8n credential references only. No token, password, PDF, or raw source text belongs in this file or the workflow JSON.
