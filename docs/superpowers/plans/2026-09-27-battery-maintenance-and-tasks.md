# Battery maintenance and household tasks implementation plan

> **For agentic workers:** Implement this plan task by task with the repository's engineering router. Keep Home Assistant changes and WallDash changes as separate, reviewable checkpoints.

**Goal:** Tell the household which replaceable device batteries need attention, which battery-powered devices are offline, what to buy or check, and what remains to be done; make the same status available to WallDash and other services through n8n.

**Architecture:** Home Assistant owns device measurements, a dedicated Local to-do list, the user-facing card and push delivery. One n8n workflow owns the verified device catalog, evaluates low/stale/offline status, synchronizes HA tasks, and keeps a structured latest snapshot in a Data Table. WallDash, the Emergency Dashboard, and future services all read that snapshot through the same authenticated, read-only n8n endpoint. Only n8n reads and writes the HA to-do list for this feature.

**Tech stack:** Home Assistant 2026.9.3, Local to-do, Companion app notifications, existing n8n with Data Tables, React/TypeScript, Express, Vitest.

**Spec:** The requirements and decisions in this plan, based on the user's 2026-09-27 request and the live Home Assistant inventory below.

## Live inventory and purchase evidence (2026-09-27)

| Device / battery entity | HA reading | Replacement guidance | Evidence / action |
| --- | ---: | --- | --- |
| Hovedlysbryter Soverom Jacob / `sensor.0x0017880104f3594d_battery` | 1% | 1 × CR2450 | HA identifies Philips Hue dimmer switch gen 1; [Zigbee2MQTT specifies CR2450](https://www.zigbee2mqtt.io/devices/324131092621.html). |
| Ekstralysbryter Soverom / `sensor.0x001788010219cb54_battery` | 2.5% | 1 × CR2450 | Same model and source. |
| Hovedlysbryter Soverom / `sensor.0x0017880104ee186e_battery` | 7% | 1 × CR2450 | Same model and source. These three suggest buying **3 × CR2450**, after confirming the current readings. |
| Vanning Planter / `sensor.0x8c65a3fffeef2fae_battery` | 0% | Likely 4 × AA | HA exposes SONOFF Zigbee smart water valve; exposed functions match [Zigbee2MQTT SWV](https://www.zigbee2mqtt.io/devices/SWV.html), and the [SONOFF SWV manual](https://support.sonoff.tech/swv-usermanual/) specifies four AA. Confirm the physical model label before purchase. |
| Aqara Temperature Sensor Vaskerom / `sensor.0x00158d000488a2e3_battery` | 0% | Likely 1 × CR2032 | HA model is generic; [Zigbee2MQTT WSDCGQ11LM](https://www.zigbee2mqtt.io/devices/WSDCGQ11LM.html) matches its temperature/humidity/pressure functions and uses CR2032. Confirm model or battery compartment first. |
| Solar Rain Sensor Tuya / `sensor.0xa4c138d9823c57d3_battery` | 6% | **Do not suggest a disposable battery yet** | HA identifies a solar rain sensor; the matching [RB-SRAIN01 profile](https://www.zigbee2mqtt.io/devices/RB-SRAIN01.html) reports battery level. Check solar charging, cleanliness, placement and exact model before treating it as a replacement task. |

The 0% Aqara and SONOFF readings were last updated on 2026-09-21; the Hue 1% and 2.5% readings updated on 2026-09-27, while the 7% reading was last updated on 2026-09-21. A stale value is a prompt to verify the device, not proof that a battery has just died. Phones, tablets, cars, UPS, vacuum, mower, and other rechargeable equipment must not produce coin-cell shopping advice. The existing `todo.homeassistant` contains 20 unrelated project tasks and should not be reused as the household maintenance list.

### Battery-powered devices that appear offline

On 2026-09-27, both the battery entity and an operational sibling were `unavailable` for all five devices below; those entities have shown unavailable since 2026-09-20. This supports a **check device/connection** task, not an automatic battery purchase claim.

| Device | Battery entity | Operational evidence |
| --- | --- | --- |
| Philips outdoor motion sensor, roadside | `sensor.0x001788010646bf54_battery` | Motion and temperature unavailable |
| Philips living-room main-light dimmer | `sensor.0x001788010670c2ff_battery` | Button event unavailable |
| Hue `Kontroll Soverom HA` dimmer | `sensor.kontroll_soverom_ha_battery` | Button events unavailable |
| Hue `Soverom HA Innside` dimmer | `sensor.soverom_ha_innside_battery` | Button events unavailable |
| Aqara front-door contact sensor | `sensor.sensor_ytterdor_battery` | Door state unavailable |

The IKEA kitchen remote (`sensor.0x14b457fffe7dc4d5_battery`) has an `unknown` battery reading and unavailable button event; include it as **needs verification**, not confirmed offline. Before opening individual tasks, check whether the Zigbee2MQTT bridge/Hue integration or many unrelated devices are down together.

## Phase 1 — Home Assistant first

### Task 1: Finish the device catalog and status rules

- [ ] Enumerate HA entities with battery device class, low-battery binary sensors, and their device-registry siblings; include hidden and disabled entries in the audit, but alert only on active devices. Record entity ID, stable device identity/model, area, replaceable vs rechargeable, exact cell type/quantity, evidence source, and last valid report. Include the five offline devices and kitchen remote above.
- [ ] Confirm ambiguous models in Zigbee2MQTT or on the device itself. Never infer purchase type from the percentage sensor or a generic name. Record `unknown` until confirmed.
- [ ] Define distinct per-device states: `healthy`, `low`, `critical`, `offline`, `unknown`, and `stale`. Require both a missing battery reading and missing operational evidence before calling a device offline; give transient dropouts a grace period. If the bridge or integration is down, report that shared fault once and suppress a flood of device tasks. Allow `offline` and `low` to coexist in the data feed while choosing one clear next action for the user.
- [ ] Assign useful HA areas to devices lacking them, where the physical location is known, so the Maintenance dashboard and messages identify the right room.

**Check:** For every alert-eligible device, a maintainer can point to a verified battery type and source; ambiguous devices say “kontroller batteritype” instead of naming a product. An integration outage does not create a task for every child device.

### Task 2: Build one reusable n8n maintenance snapshot

- [ ] Create one n8n workflow that reads the curated HA battery and operational entities on a schedule, evaluates the Task 1 rules, and upserts one latest-snapshot row in a Data Table. Use the existing HA credential in n8n; keep it out of workflow JSON and output. Do not overwrite the last good snapshot when HA is unreachable; mark `sourceAvailable: false` and advance `checkedAt` while retaining `observedAt` from the last successful read.
- [ ] Publish a versioned, read-only JSON contract through an authenticated n8n Webhook + Respond to Webhook path. Shape: `{ schemaVersion: 1, observedAt, checkedAt, sourceAvailable, devices: [{ id, name, area, batteryEntityId, level, batteryType, quantity, replaceable, status, action, evidenceUpdatedAt }], tasks: [{ id, deviceId, kind, summary, description, due, status }] }`. `kind` is `replace_battery`, `check_offline`, or `verify_device`; `action` is human-readable Norwegian. Read current HA to-do item status during each successful sync so a task completed in HA also disappears from both dashboard consumers. No HA token, private network details, or unnecessary person data in the response.
- [ ] Document the endpoint, auth method, fields, timestamps, stale-data behavior, and a sample payload without credentials. Use stable device IDs and task IDs so consumers do not parse Norwegian summaries to identify devices. Keep the Data Table as a snapshot/cache, not a second editable task system.

**Check:** A read-only client can retrieve one well-formed snapshot from n8n; after a simulated HA outage it receives the last observation clearly marked stale. Unauthorized requests fail. A restored HA connection refreshes the snapshot.

### Task 3: Give the user a persistent Home Assistant view

- [ ] Use the built-in [Maintenance dashboard](https://www.home-assistant.io/integrations/battery/) as the full battery overview. Add it to the HA sidebar if it is not already visible.
- [ ] Create one dedicated **Local to-do** list, e.g. `Husvedlikehold`, for actionable household work. Its exact entity ID must be read after creation; do not assume it. n8n synchronizes one task per device/action, such as `Bytt batteri: Hovedlysbryter Soverom Jacob` with `Kjøp 1 × CR2450; nå 1 %`, or `Sjekk tilkobling: Dørsensor Ytterdør` with last-seen context and **no** purchase claim. Use the built-in [to-do list card](https://www.home-assistant.io/dashboards/todo-list/) on the household HA dashboard. If a separate card for current faults is still needed after trying Maintenance, add a compact card that links to the full view.

**Check:** A user can see the device, urgency, and correct next action in HA; purchase tasks include verified battery type and quantity, while offline tasks say to check connectivity. Completing a task is possible from the card.

### Task 4: Notify without duplicate or misleading alerts

- [ ] Have the n8n workflow reconcile low, critical, offline, and verify-device findings against `todo.get_items`, then add/update only missing or changed tasks. Initial battery policy: **low below 20%; critical at or below 5% or an asserted low-battery binary sensor**. Make thresholds and offline grace period adjustable after observing the devices. Do not open purchase tasks for stale, `unknown`, or `unavailable` readings. Do not auto-complete an offline task until a valid operational reading returns, or a battery task solely because of one transient percentage rise.
- [ ] Use a small HA automation on `todo.item_added` or a deliberate n8n-to-HA notification action to send a [Companion app notification](https://companion.home-assistant.io/docs/notifications/notifications-basic/) to the intended recipient when a new task opens or becomes critical. Include room, device, clear next action, verified battery type/quantity **only when relevant**, and a link to the HA task view. Use a stable per-device notification tag and cooldown. If the whole Zigbee/Hue integration is unavailable, send one infrastructure alert rather than individual battery pushes.

**Check:** Simulate low, critical, restored, stale, one offline device, an integration outage and HA outage; verify one appropriate task per device, no duplicate notifications, no invented purchase advice, and no battery alert for a charging phone, car, mower or solar rain sensor.

## Phase 2 — WallDash tasks

### Task 5: Read the shared n8n feed through the WallDash server

**Affected files:** `src/server/app.ts`, `src/server/index.ts`, `src/client/api.ts`, a small server-side n8n feed client, and their existing focused tests.

- [ ] Configure only the authenticated n8n feed URL and credential on the WallDash server. Fetch the versioned snapshot with a bounded timeout and validate the fields WallDash needs. Return a narrow same-origin response containing incomplete tasks and status/observation time. Do not send the n8n credential or upstream URL to the browser.
- [ ] Keep the WallDash view read-only. People complete tasks in Home Assistant; the next n8n sync updates the common snapshot and both dashboards. The HA `todo` entity's numeric state is only a count and is not the WallDash data source.

**Check:** API tests cover response mapping, empty list, stale source, n8n failure, malformed items, and unauthorized upstream responses. Existing state and action tests remain green.

### Task 6: Show tasks in the established WallDash layout

**Affected files:** `src/client/MainDashboardPrototype.tsx`, the related styles and focused tests.

- [ ] Replace the prototype's hard-coded `fallbackTodayTasks` in the existing **Dette skjer / today** area with real incomplete items from the dedicated HA list. Show a small count and the first few useful tasks; tap opens a detail view with full text and the right action. Battery replacement details show type/quantity; offline details show last known status and a connection check. Keep the main 1920 × 1200 tablet screen free of page scrolling and do not put battery status in a second place on the same screen.
- [ ] Show a calm empty state, and a distinct “could not load tasks” state rather than presenting old placeholder work as live. Preserve the current accessible buttons and detail-modal focus behavior.

**Check:** At tablet size, no card overlaps or clips; keyboard/touch access works; a completed HA task disappears after the n8n sync; a stale or failed feed does not show fake current tasks. Run relevant Vitest tests, `npm.cmd run build`, typecheck/lint scripts available in `package.json`, and `git diff --check` before local commits. Do not push or deploy as part of this plan.

## Phase 3 — Other consumers

### Task 7: Connect the Emergency Dashboard to the n8n feed

- [ ] In `C:\Code\Emergency Dashboard Home Services`, add a read-only client for the authenticated n8n snapshot alongside its existing `app/home_assistant_client.py` status check. Use a separate credential and bounded timeout. Show battery/offline maintenance as context, never as proof that Home Assistant itself is healthy or as a prerequisite for repair controls.
- [ ] Display `observedAt` and an explicit stale/unavailable label when n8n or HA has stopped updating. Keep the existing Proxmox recovery path usable when n8n is down. Add focused tests for fresh, stale, unavailable, and unauthorized feed responses.

**Check:** The emergency dashboard can show the last known device issues while HA is down, and its repair controls still load when n8n is down. This is separate repository work with its own branch, checks, and deployment decision.

## Review focus

- Battery percentages can be stale or unavailable; neither should become a false “buy this battery” claim.
- An individual device outage and a shared Zigbee/Hue outage require different tasks and notification volume.
- A device can expose two battery entities; create at most one task per physical replacement action.
- A completed task can coexist with an old low reading; do not instantly recreate it without a fresh report or deliberate reset.
- Battery type changes by model revision; require exact-model evidence before purchase wording.
- HA's `todo` state is a count; n8n must fetch items and include task status in the shared snapshot.
- A cached n8n snapshot is useful during a HA outage only when its observation time and source availability are explicit.
