# Siden sist: familieinnboks og aktivitet

## Ownership and status

- Created: 2026-09-10
- Status: Ready for engineering
- Target: V2 dashboard on `codex/dashboard-prototype-v2`
- Design basis: approved concepts from the 2026-09-10 Codex conversation
- Implementation: deliberately deferred to a new task

## Problem and user need

`Det som har skjedd` currently behaves as a dense, continuously moving notice board. It mixes family information with recent activity, gives no durable read state, and omits the security events that are most useful when the household returns home.

The replacement must answer three different questions without blending them together:

1. What was the last relevant camera event while the house was away?
2. Which family messages have not been read yet?
3. What meaningful home and security events happened recently?

The family inbox must also preserve the complete Jacob/Zokrates and Nicolai/MyKid views currently available from the person popups.

## Locked product decisions

### Naming and hierarchy

- Rename the past lane heading from `DET SOM HAR SKJEDD` to `SIDEN SIST`.
- Replace the single large message surface with three vertically ordered modules:
  1. `SIST MENS HUSET VAR BORTE`
  2. `Beskjeder`
  3. `Hendelser`
- Preserve the established warm, dark Walldash visual language and the current `Akkurat nå`, `Dette skjer`, and bottom-control areas.

### Last event while away

- Home Assistant is authoritative for the latest completed Away interval.
- A completed interval begins when `input_select.home_state` changes to `Borte` and ends when it next changes to `Hjemme`.
- Frigate is authoritative for review-item metadata and recording media within that interval.
- Select the latest qualifying Frigate review item whose start time is inside the completed Away interval.
- Prefer `alert` review items. If no alert exists, use the latest `detection` review item.
- The card shows the Frigate thumbnail, camera/zone-derived description, local date and time, and a play control when media exists.
- The dashboard server proxies media. The browser must never receive the Frigate base URL, Home Assistant token, or unrestricted proxy parameters.
- Never substitute footage from outside the Away interval.
- If metadata exists but media has expired, show `Opptaket er ikke lenger tilgjengelig` and keep the event description/time visible.
- If the last completed Away interval contains no review item, show `Ingen registrerte hendelser mens huset var borte`.
- If Home Assistant or Frigate is unavailable, show `Kunne ikke hente hendelser fra sist huset var borte`.

### Family inbox

- The dashboard card is titled `Beskjeder`.
- It shows unread messages only, newest first, with a combined unread count.
- Show at most two message rows on the dashboard. Each row includes person tag, concise preview, and relative age such as `4 dager`.
- `Se alle` opens one family modal.
- The modal has three top-level tabs in this order:
  1. `Beskjeder`
  2. `Jacob` with secondary label `Zokrates`
  3. `Nicolai` with secondary label `MyKid`
- The `Beskjeder` tab contains `Ulest` and `Alle` filters.
- Opening a message displays its full body without automatically marking it read.
- The explicit action is `Marker som lest`.
- A read message disappears from the dashboard card and from the `Ulest` filter, but remains in `Alle` with status `Lest`.
- A read message can be restored with `Marker som ulest`.
- Helper copy is `Leste meldinger fjernes fra forsiden, men er fortsatt tilgjengelige her.`
- Read state is device-local and persists in `localStorage`. Cross-device synchronization is a non-goal for this version.
- Store receipts as `{ id, readAt }`, version the storage key, tolerate malformed storage, and discard receipts older than 365 days.
- A newly discovered message is unread unless its stable ID already has a receipt.

### Stable message identity

- MyKid items use the upstream item `id` when present.
- If a MyKid item lacks `id`, derive a deterministic ID from `Nicolai`, `published_at`, `title`, and `details`.
- Zokrates currently exposes messages as strings. Derive a deterministic ID from `Jacob` and the normalized complete message body, not from array position or `source_updated_at`.
- IDs remain internal and are never rendered.

### Person views preserved inside the family modal

The person tabs are full overviews, not message filters.

The `Jacob · Zokrates` tab preserves:

- `Skoledager`
- `Hendelser`
- `Påminnelser`
- `Lekser`
- `Temaer`
- `Meldinger til hjemmet`

The `Nicolai · MyKid` tab preserves:

- `I dag`
- `I morgen`
- `Oppslagstavle`
- `Siste nyhetsbrev`
- `Kommende hendelser`
- `Ukeplaner`
- `Bursdager`

Both person views remain readable when all messages are marked read. Marking a message read must not remove it from its person overview.

### Event timeline

- The compact dashboard timeline is titled `Hendelser` and shows at most five entries, newest first.
- A `Se alle` action opens the full recent timeline when more entries exist.
- Use a rolling 24-hour window. When fewer than three meaningful events exist, extend the query to seven days.
- Include only these event types:
  - doorbell visitor sensor changing from `off` to `on`;
  - front-door lock changing to `locked` or `unlocked`;
  - home state changing to `Hjemme` or `Borte`;
  - configured Home Assistant Frigate image entities receiving a new detection timestamp.
- Do not include generic motion, occupancy clearing, sensor refreshes, unavailable transitions, or repeated identical states.
- Frigate detection rows show the normalized object label and camera/zone, for example `Person registrert · Bod`.
- Door and home-state rows use mint only for secure/locked state; normal events use the existing warm accent.
- Tapping a Frigate row opens its matched Frigate review recording when available. Other rows are informational.

## Live integration findings

The following facts were verified read-only on 2026-09-10 and must be rediscovered or configured during implementation rather than hard-coded:

- Home Assistant exposes `input_select.home_state`, `lock.aqara_smart_lock_u200_2`, and `binary_sensor.ringeklokke_visitor`.
- Home Assistant exposes Frigate-backed detection images such as `image.bod_person`, `image.gaardsplassen_wide_person`, and `image.gaardsplassen_wide_car`.
- The loaded Frigate integration identified the server as `192.168.1.66:5000`.
- Frigate version was `0.17-0` with cameras `Gaardsplassen_Wide`, `Bakside`, `Hagen`, and `Bod`.
- The latest completed Away interval was 2026-08-28 07:50–14:53 Europe/Oslo.
- The latest review item in that interval was a car in `Parkering` on `Gaardsplassen_Wide` at 14:50.
- That review item's media had expired. The expired-media state is therefore required, not hypothetical.

## Data contract

Add a dedicated response rather than placing compound activity data inside Home Assistant state attributes:

```ts
export type ActivityEventKind = 'doorbell' | 'lock' | 'home' | 'frigate';

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  occurredAt: string;
  title: string;
  detail?: string;
  tone: 'default' | 'safe' | 'notice';
  mediaPath?: string;
}

export interface AwayCapture {
  status: 'available' | 'expired' | 'none' | 'unavailable';
  awayStartedAt?: string;
  homeReturnedAt?: string;
  event?: ActivityEvent;
  thumbnailPath?: string;
  mediaPath?: string;
}

export interface ActivityPayload {
  generatedAt: string;
  awayCapture: AwayCapture;
  timeline: ActivityEvent[];
}
```

`GET /api/activity` returns `ActivityPayload`. Media paths are same-origin allow-listed endpoints generated by the server.

## Configuration

Add typed configuration with deliberately empty examples where deployment-specific:

```dotenv
FRIGATE_URL=
HA_DOORBELL_VISITOR_ENTITY_ID=binary_sensor.ringeklokke_visitor
HA_FRIGATE_EVENT_ENTITY_IDS=
```

`HA_FRIGATE_EVENT_ENTITY_IDS` is a comma-separated allow-list of Home Assistant `image.*` entities. Do not accept entity IDs from browser requests.

## Security and privacy

- All Home Assistant and Frigate calls happen server-side.
- The media endpoints accept only a server-issued/matched review ID and never a caller-provided upstream URL.
- Validate Frigate IDs, camera names, and timestamps before constructing upstream paths.
- Apply bounded timeouts and abort upstream streams when the client disconnects.
- Do not persist clips or thumbnails in the dashboard container.
- The dashboard must not expose tokens, Home Assistant `entity_picture` access tokens, Frigate configuration, or upstream error bodies.
- Marking a message read is local presentation state and does not alter Zokrates, MyKid, Home Assistant, or PostgreSQL records.

## Accessibility

- Modal uses `role="dialog"`, `aria-modal="true"`, a labelled heading, initial focus, Escape close, backdrop close, and focus restoration.
- Top-level person/navigation controls use a real tablist.
- `Ulest`/`Alle` use a second labelled tablist or segmented control.
- Mark-read actions have at least a 48 px hit area and include the message subject in their accessible name.
- Timeline is an ordered list. Icons are supplementary and hidden from screen readers when the text already communicates meaning.
- Media controls expose `Spill av opptak fra …`; unavailable media is not rendered as a disabled play button.
- Selected and read states do not depend on color alone.

## Copy matrix

| Context | Copy |
| --- | --- |
| Past lane | `SIDEN SIST` |
| Away card | `SIST MENS HUSET VAR BORTE` |
| Expired recording | `Opptaket er ikke lenger tilgjengelig` |
| No away event | `Ingen registrerte hendelser mens huset var borte` |
| Away integration error | `Kunne ikke hente hendelser fra sist huset var borte` |
| Inbox title/tab | `Beskjeder` |
| Unread filter | `Ulest` |
| All filter | `Alle` |
| Mark read | `Marker som lest` |
| Read status | `Lest` |
| Restore unread | `Marker som ulest` |
| Inbox helper | `Leste meldinger fjernes fra forsiden, men er fortsatt tilgjengelige her.` |
| Empty unread | `Ingen uleste beskjeder` |
| Empty all | `Ingen beskjeder er tilgjengelige ennå` |
| Timeline title | `Hendelser` |
| Empty timeline | `Ingen nye hendelser` |

## Loading and failure behavior

- Render skeleton geometry for the three modules during the initial activity request; do not flash empty-state copy before the request resolves.
- Family messages are derived from the already loaded dashboard states and remain usable if `/api/activity` fails.
- If Home Assistant history fails but Frigate is healthy, return the timeline events that can be trusted and mark Away capture unavailable.
- If Frigate fails, return Home Assistant doorbell/lock/home events and mark Frigate media unavailable.
- Poll `/api/activity` every 30 seconds while the page is visible. Visibility/focus/browser-online events trigger an immediate refresh.
- Preserve the last confirmed payload through transient failures and show a quiet stale-data notice only after three consecutive failures.

## Non-goals

- Marking source messages as read in Zokrates or MyKid.
- Synchronizing read state across phones, browsers, or household members.
- Building a general Home Assistant logbook browser.
- Showing every Frigate detection or generic motion event.
- Persisting Frigate media in the dashboard.
- Changing the `Akkurat nå`, `Dette skjer`, or bottom-control feature set.

## Acceptance criteria

- `SIDEN SIST` contains the Away capture, family inbox, and event timeline in that order at the 1920×1200 acceptance viewport.
- The dashboard never shows a read family message.
- Every read message remains visible under `Beskjeder > Alle` and in the relevant person overview.
- `Marker som ulest` returns a message to the dashboard when it is among the two newest unread items.
- Jacob and Nicolai tabs expose every existing category listed above.
- Relative ages use Norwegian day labels and remain correct across reloads.
- The Away capture is selected only from the latest completed Home Assistant Away interval.
- Expired footage is clearly labelled and never replaced with footage from another interval.
- The event timeline filters out `off` occupancy edges, generic motion, and unavailable transitions.
- No upstream URL or credential appears in API responses, markup, logs, or browser network URLs.
- Existing V2 camera, weather, agenda, scene, and person-detail tests continue to pass or are updated only where the approved interaction has intentionally changed.
- `npm.cmd test`, `npm.cmd run build`, and `git diff --check` pass before commit.
- The verified commit is pushed to `origin/codex/dashboard-prototype-v2` and only the V2 Portainer stack is restarted and verified according to `AGENTS.md`.

## Pending questions

None. The specification is ready for implementation.

