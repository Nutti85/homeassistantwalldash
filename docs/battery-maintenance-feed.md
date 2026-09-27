# Battery maintenance feed

Home Assistant owns the `todo.husvedlikehold` Local to-do list. Its card is on the sidebar dashboard `hus-vedlikehold/oversikt`. Complete tasks there. No mobile notification automation is configured.

n8n workflow `1e6kqgvlioY4093u` runs every 30 minutes. It reads HA states and to-do items, reconciles actionable tasks, then upserts the single `latest` row in Data Table `PvmdwPwMSBPMH0mh`. n8n workflow `yrj7f2nxK32Nggzr` serves that row at:

`GET http://192.168.1.50:5678/webhook/maintenance/v1/snapshot`

Send `X-Maintenance-Feed-Key` in the request header. Configure each consumer's server environment with the key from the n8n credential **Home maintenance read feed**; keep it out of browser code, logs, Git, and URLs. The temporary local key file is ignored by Git and is not a deployment artifact. The read endpoint returns 403 without the header. There is no public write webhook.

Example response shape (values illustrative):

```json
{
  "schemaVersion": 1,
  "observedAt": "2026-09-27T07:41:21.449Z",
  "checkedAt": "2026-09-27T07:41:21.531Z",
  "sourceAvailable": true,
  "devices": [{
    "id": "0x0017880104f3594d",
    "name": "Hovedlysbryter Soverom Jacob",
    "area": "Jacobs soverom",
    "batteryEntityId": "sensor.0x0017880104f3594d_battery",
    "level": 1,
    "batteryType": "CR2450",
    "quantity": 1,
    "replaceable": true,
    "status": "critical",
    "batteryStatus": "critical",
    "connectionStatus": "unknown",
    "action": "Kjøp 1 × CR2450 og bytt batteri.",
    "evidenceUpdatedAt": "2026-09-26T23:37:34.822735+00:00"
  }],
  "tasks": [{
    "id": "battery:0x0017880104f3594d:replace_battery",
    "deviceId": "0x0017880104f3594d",
    "kind": "replace_battery",
    "summary": "Bytt batteri: Hovedlysbryter Soverom Jacob",
    "description": "Kjøp 1 × CR2450 og bytt batteri.",
    "due": null,
    "status": "needs_action",
    "evidenceUpdatedAt": "2026-09-26T23:37:34.822735+00:00"
  }]
}
```

`observedAt` is null before the first successful sync. `checkedAt` advances on each completed sync. If HA states or the to-do list cannot be read, n8n retains the last observation, sets `sourceAvailable:false`, and advances `checkedAt`. A client should show that data as stale. Device `status` is the primary state (`healthy`, `low`, `critical`, `offline`, `unknown`, or `stale`); `batteryStatus` and `connectionStatus` preserve the separate evidence. Nullable fields stay null when unknown. `tasks.status` is HA's `needs_action` or `completed`; dashboards should show only incomplete tasks.

The current curated catalog has ten physical devices with active issues. The two unavailable Hue integration entities in the bedroom map by MAC to Zigbee2MQTT devices already in this catalog, so they do not create duplicate offline tasks. CR2450 is confirmed for the three Hue dimmer switch gen 1 devices; only two have fresh critical readings. Other ambiguous models keep `batteryType:null` until the physical model is confirmed. A 48-hour stale threshold and 30-minute offline grace are in the assessment code. The Zigbee2MQTT bridge must be connected before individual offline tasks are opened.

The committed `n8n/maintenance-workflows.json` contains workflow structure without credential bindings. `n8n/maintenance-assess.js` and `n8n/maintenance-snapshot.js` are the source copies of the two Code nodes. After editing them, update those nodes in n8n and rerun the self-check. Imported workflows must reconnect the existing HA bearer credential and the read feed header credential.
