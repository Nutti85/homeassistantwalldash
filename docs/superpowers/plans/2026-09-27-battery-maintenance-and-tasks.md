# Battery maintenance and household tasks implementation plan

> **For agentic workers:** Implement this plan task by task with the repository's engineering router. Keep Home Assistant changes and WallDash changes as separate, reviewable checkpoints.

**Goal:** Tell the household which replaceable device batteries need attention, what to buy, and what remains to be done; later show those tasks on WallDash.

**Architecture:** Home Assistant owns battery measurements, notifications, and a dedicated Local to-do list. A small, verified catalog maps eligible battery entities to replacement type and quantity. WallDash later reads only the chosen `todo` entity through its existing server-side Home Assistant client and displays incomplete items in the existing task area.

**Tech stack:** Home Assistant 2026.9.3, Local to-do, Companion app notifications, React/TypeScript, Express, Vitest.

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

The 0% Aqara and SONOFF readings were last updated on 2026-09-21; the Hue 1% and 2.5% readings updated on 2026-09-27, while the 7% reading was last updated on 2026-09-21. A stale value is a prompt to verify the device, not proof that a battery has just died. Two other Hue battery entities are `unavailable`; investigate connectivity separately. Phones, tablets, cars, UPS, vacuum, mower, and other rechargeable equipment must not produce coin-cell shopping advice. The existing `todo.homeassistant` contains 20 unrelated project tasks and should not be reused as the household maintenance list.

## Phase 1 — Home Assistant first

### Task 1: Finish the device catalog

- [ ] Enumerate HA entities with battery device class, low-battery binary sensors, and their device-registry siblings; include hidden and disabled entries in the audit, but alert only on active readings. Record entity ID, stable device identity/model, area, replaceable vs rechargeable, exact cell type/quantity, evidence source, and last valid report.
- [ ] Confirm ambiguous models in Zigbee2MQTT or on the device itself. Never infer purchase type from the percentage sensor or a generic name. Record `unknown` until confirmed.
- [ ] Assign useful HA areas to devices lacking them, where the physical location is known, so the Maintenance dashboard and messages identify the right room.

**Check:** For every alert-eligible device, a maintainer can point to a verified battery type and source; ambiguous devices say “kontroller batteritype” instead of naming a product.

### Task 2: Give the user a persistent Home Assistant view

- [ ] Use the built-in [Maintenance dashboard](https://www.home-assistant.io/integrations/battery/) as the full battery overview. Add it to the HA sidebar if it is not already visible.
- [ ] Create one dedicated **Local to-do** list, e.g. `Husvedlikehold`, for actionable household work. Its exact entity ID must be read after creation; do not assume it. Put one task per affected device, such as `Bytt batteri: Hovedlysbryter Soverom Jacob` with `Kjøp 1 × CR2450; nå 1 %` in the description. Use the built-in [to-do list card](https://www.home-assistant.io/dashboards/todo-list/) on the household HA dashboard. If a separate card for current low batteries is still needed after trying Maintenance, add a compact card that shows only eligible, current faults and links to the full view.

**Check:** A user can see the device, urgency, battery type and quantity in HA; completing a task is possible from the card. The card is empty or hidden when no maintenance tasks remain.

### Task 3: Notify without duplicate or misleading alerts

- [ ] Configure an HA automation using the native [battery triggers](https://www.home-assistant.io/integrations/battery/) for new low-battery events, plus a daily reconciliation for values already low at setup/restart. Scope it to the curated replaceable devices. Initial policy: **low below 20%; critical at or below 5% or an asserted low-battery binary sensor**. Make the thresholds adjustable after observing the actual devices.
- [ ] Before adding a task, use `todo.get_items` to find an existing incomplete item for the same device. Update its reading when useful; do not create duplicates. Suppress new purchase tasks for stale, `unknown`, or `unavailable` readings; surface these as separate device-health checks. Do not automatically clear a task solely because a sensor briefly reports a higher value. Clear or complete it after a confirmed replacement/new valid reading, or let the household complete it manually.
- [ ] Send a [Companion app notification](https://companion.home-assistant.io/docs/notifications/notifications-basic/) to the intended household recipient when a new task is opened or urgency becomes critical. Include room, device, percentage, exact verified battery and quantity, and a link to the HA task view. Use a stable per-device notification tag so updates replace the earlier notification. Send a calm daily summary only while unresolved tasks exist, with a cooldown to prevent repeated push messages.

**Check:** Simulate low, critical, restored, stale and unavailable states; verify one task per device, correct purchase wording, one useful push per transition, and no alert for a charging phone, car, mower or solar rain sensor.

## Phase 2 — WallDash tasks

### Task 4: Read the dedicated HA list through the existing server

**Affected files:** `src/server/homeAssistant.ts`, `src/server/app.ts`, `src/server/index.ts`, `src/shared/entities.ts`, `src/client/api.ts` and their existing focused tests.

- [ ] Add one configured, server-side allow-listed `todo` entity ID. Fetch incomplete items with HA `todo.get_items` and return a narrow typed response (`uid`, summary, description, due, status). The `todo` entity state is only an incomplete-item **count**, so it cannot supply task text. Keep `HA_TOKEN` and arbitrary entity IDs out of the browser.
- [ ] If task completion from WallDash is wanted, add a narrow `todo.update_item` endpoint accepting a UID from that configured list only; confirm by rereading the list. Start read-only if the HA card already handles completion well.

**Check:** API tests cover response mapping, empty list, HA failure, malformed items, and rejecting updates outside the allow-listed list. Existing state and action tests remain green.

### Task 5: Show tasks in the established WallDash layout

**Affected files:** `src/client/MainDashboardPrototype.tsx`, the related styles and focused tests.

- [ ] Replace the prototype's hard-coded `fallbackTodayTasks` in the existing **Dette skjer / today** area with real incomplete items from the dedicated HA list. Show a small count and the first few useful tasks; tap opens a detail view with full text, battery type and quantity. Keep the main 1920 × 1200 tablet screen free of page scrolling and do not put battery status in a second place on the same screen.
- [ ] Show a calm empty state, and a distinct “could not load tasks” state rather than presenting old placeholder work as live. Preserve the current accessible buttons and detail-modal focus behavior.

**Check:** At tablet size, no card overlaps or clips; keyboard/touch access works; a completed HA task disappears after refresh; a HA outage does not show fake tasks. Run relevant Vitest tests, `npm.cmd run build`, typecheck/lint scripts available in `package.json`, and `git diff --check` before local commits. Do not push or deploy as part of this plan.

## Review focus

- Battery percentages can be stale or unavailable; neither should become a false “buy this battery” claim.
- A device can expose two battery entities; create at most one task per physical replacement action.
- A completed task can coexist with an old low reading; do not instantly recreate it without a fresh report or deliberate reset.
- Battery type changes by model revision; require exact-model evidence before purchase wording.
- HA's `todo` state is a count; WallDash must fetch items and handle an unavailable list.
