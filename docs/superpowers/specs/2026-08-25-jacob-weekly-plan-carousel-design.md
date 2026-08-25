# Jacob weekly-plan carousel design

## Goal

Add a second card to the regular dashboard’s existing calendar slot. The slot will automatically alternate between the household calendar and a compact summary of Jacob’s school-week plan, with two top-right pagination dots showing the active card.

## Scope

This feature has two parts:

1. A dashboard carousel that owns the existing calendar slot and alternates between Calendar and Jacob’s weekly plan.
2. A dedicated n8n publishing workflow that reads the latest normalized Jacob plan from the Klara AI PostgreSQL database, formats a readable summary, and publishes a full structured snapshot to Home Assistant.

The original weekly-plan PDF and large source text remain in the Klara database/object storage. They are not copied into Home Assistant state attributes.

## Architecture

The data path is:

```text
Klara AI PostgreSQL
  -> n8n PostgreSQL query nodes
  -> n8n Code node: normalize and format
  -> Home Assistant state API
  -> sensor.jacob_weekly_plan
  -> WallDash state polling
```

The WallDash frontend continues to consume dynamic data through its existing Home Assistant state snapshot. It does not receive Klara database credentials and does not connect directly to PostgreSQL.

## Home Assistant entity contract

The published entity is configurable through `HA_JACOB_WEEKLY_PLAN_ENTITY_ID` and defaults to `sensor.jacob_weekly_plan`.

The entity state is a short availability label such as `Denne uken`, `Neste uke`, or `Ukjent`. Attributes contain the normalized snapshot:

```ts
type JacobWeeklyPlanSnapshot = {
  summary: string;
  week_start?: string;
  week_end?: string;
  source_updated_at?: string;
  plan_id?: string | number;
  events: Array<{
    date?: string;
    weekday?: string;
    time?: string;
    title: string;
    details?: string;
  }>;
  reminders: Array<{
    date?: string;
    weekday?: string;
    title: string;
    details?: string;
  }>;
  homework: Array<{
    subject?: string;
    date?: string;
    weekday?: string;
    title: string;
    details?: string;
  }>;
  school_schedule: Array<{
    date?: string;
    weekday?: string;
    title: string;
    details?: string;
  }>;
  topics: string[];
  messages: string[];
};
```

Missing collections are published as empty arrays. Missing optional scalar values are omitted or published as an empty string. The workflow must keep all human-readable fields in Norwegian and use ISO dates for machine-readable date fields while retaining readable weekday/date text where useful.

## n8n workflow

Create a separate workflow named `Klara – Publish Jacob weekly plan to Home Assistant`.

The workflow:

1. Loads the latest weekly plan for the stable person/child key `jacob`.
2. Reads the related events, reminders, homework, school schedule, topics, and messages.
3. Uses one Code node to normalize database rows into the exact snapshot contract above, sort items by date/time, group readable content by weekday, and generate the short `summary` used by the card.
4. Uses a Home Assistant API request node to write the entity state and attributes.
5. Treats an empty result as a valid unavailable snapshot rather than failing the workflow.

Credentials are referenced by n8n credential IDs/names and are never embedded in committed workflow JSON. The PostgreSQL query uses the restricted Klara ingestion/read credential. The Home Assistant node uses the existing restricted Home Assistant credential. The workflow may be triggered manually and by a schedule; the dashboard does not depend on a synchronous workflow call.

## Carousel behavior

The regular-mode calendar placement becomes a single carousel component with two slides:

- Slide 1: existing household Calendar content, including waste collection.
- Slide 2: Jacob’s weekly-plan summary, events, and reminders.

It starts on Calendar whenever the dashboard mounts or regular mode is entered. It automatically changes slide every 30 seconds. Tapping the pagination control switches to the selected slide; horizontal pointer/touch swipes also switch slides. Switching resets the 30-second timer. The timer pauses while the document is hidden and resumes when visible. Reduced-motion users receive the same content and controls without animated transitions.

The top-right indicator contains exactly two small buttons/dots. The active dot is filled, the inactive dot is hollow, and each has an accessible label (`Vis kalender` / `Vis Jacobs skoleplan`) plus `aria-current` or equivalent selected state. The dots are positioned inside the shared card header and do not overlap content.

If the weekly-plan entity is unavailable, slide 2 remains selectable and shows a concise Norwegian empty state with its last-known update when available. Calendar rendering and carousel operation must not be affected by a missing or malformed plan attribute.

## Files and boundaries

- `src/shared/entities.ts`: add the configurable/default Home Assistant entity ID and snapshot type.
- `src/server/index.ts` and related server state mapping: request the plan entity with the existing state snapshot.
- `src/client/dashboardModel.ts`: add pure parsing/normalization helpers for Home Assistant plan attributes.
- `src/client/App.tsx`: add the carousel shell, plan card, timer, and pointer interaction while preserving the current calendar markup/data rules.
- `src/client/styles.css`: style the shared card, dots, plan content, responsive overflow, and reduced-motion behavior.
- `src/client/*.test.ts(x)`: cover parsing, carousel switching/timer behavior, dot accessibility, and unavailable data.
- `docs/n8n-jacob-weekly-plan-publish.md`: document the n8n query/output contract and credential placeholders without secrets.
- `n8n/klara-publish-jacob-weekly-plan.json`: commit an importable workflow template with credential references represented as placeholders.

## Error handling and safety

The frontend treats malformed attributes as empty sections and never lets plan parsing throw during the main state render. The backend retains its existing state-poll retry behavior. n8n logs row/query failures through its normal execution status and does not overwrite a valid Home Assistant snapshot on a failed query; an intentionally empty valid plan may overwrite the entity when the database has no current plan.

The workflow must not include passwords, access tokens, private endpoints that contain credentials, or original PDF contents. Existing user changes in the dirty worktree must be preserved.

## Testing and acceptance criteria

- Existing calendar content still appears in slide 1 and keeps its current day filtering and waste section.
- Slide 2 renders Norwegian summary, events, and reminders from the Home Assistant attribute snapshot.
- The active dot visibly tracks the active slide; both dots are individually keyboard/touch accessible.
- Automatic rotation occurs at 30 seconds, pauses while hidden, and is reset by manual switching.
- Missing/malformed plan data produces a stable empty state without breaking the dashboard.
- n8n workflow output matches the documented snapshot contract and contains no secrets.
- Full unit test suite and production build pass.
