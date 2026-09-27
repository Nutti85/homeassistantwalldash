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
    "description": "Kjøp 1 × CR2450 og bytt batteri.\nBatteritype: 1 × CR2450.\nSiste nivå: 1 %.\nSist observert: 27.09.2026 kl. 01:37.",
    "due": null,
    "status": "needs_action",
    "evidenceUpdatedAt": "2026-09-26T23:37:34.822735+00:00"
  }]
}
```

`observedAt` is null before the first successful sync. `checkedAt` advances on each completed sync. If HA states or the to-do list cannot be read, n8n retains the last observation, sets `sourceAvailable:false`, and advances `checkedAt`. A client should show that data as stale. Device `status` is the primary state (`healthy`, `low`, `critical`, `offline`, `unknown`, or `stale`); `batteryStatus` and `connectionStatus` preserve the separate evidence. Nullable fields stay null when unknown. `tasks.status` is HA's `needs_action` or `completed`; dashboards should show only incomplete tasks.

The current catalog has ten physical devices with active issues. The two unavailable Hue integration entities in the bedroom map by MAC to Zigbee2MQTT devices already in this catalog, so they do not create duplicate offline tasks. Every HA task shows the battery type and a short Europe/Oslo timestamp; the internal task ID stays in the n8n feed, not in the visible description. n8n matches HA items by their generated summary, so those summaries should not be manually renamed.

| Device group | Battery | Model evidence |
| --- | --- | --- |
| Four Philips Hue dimmer switches | 1 × CR2450 each | HA reports Hue dimmer switch/gen 1 and matching action exposures; [Zigbee2MQTT](https://www.zigbee2mqtt.io/devices/324131092621.html). |
| Aqara temperature sensor, Vaskerom | 1 × CR2032 | HA temperature, humidity, pressure, and voltage exposures match [WSDCGQ11LM](https://www.zigbee2mqtt.io/devices/WSDCGQ11LM.html). |
| SONOFF plant watering valve | 4 × AA | HA model and functions match [SWV](https://www.zigbee2mqtt.io/devices/SWV.html); [SONOFF manual](https://support.sonoff.tech/swv-usermanual/) specifies the cells. |
| Tuya solar rain sensor | Solar charged Li-ion, 3.7 V / 1300 mAh | HA rain and light exposures match [RB-SRAIN01](https://www.zigbee2mqtt.io/devices/RB-SRAIN01.html); its [manual](https://ae01.alicdn.com/kf/Sf00c76764f25465c89984f380894f239b.pdf) specifies the internal battery. Check charging and placement; do not suggest a disposable cell. |
| Philips Hue outdoor motion sensor | 2 × AA | HA model and exposures match the [Zigbee2MQTT profile](https://www.zigbee2mqtt.io/devices/9290030674.html); [Philips Hue](https://www.philips-hue.com/en-us/p/hue-outdoor-sensor/046677570989) specifies AA. |
| Aqara front door contact sensor | 1 × CR1632 | HA contact, voltage, temperature, outage and trigger exposures match [MCCGQ11LM](https://www.zigbee2mqtt.io/devices/MCCGQ11LM.html). |
| IKEA kitchen remote | 1 × CR2032 | HA model, firmware and actions match [E1524/E1810](https://www.zigbee2mqtt.io/devices/E1524_E1810.html). |

The generic HA model labels for the Aqara and Tuya devices are matched to Zigbee2MQTT profiles by their exposed functions; check the marking on a physical device before buying if it differs from this catalog. A 48-hour stale threshold and 30-minute offline grace are in the assessment code. The Zigbee2MQTT bridge must be connected before individual offline tasks are opened.

The committed `n8n/maintenance-workflows.json` contains workflow structure without credential bindings. `n8n/maintenance-assess.js` and `n8n/maintenance-snapshot.js` are the source copies of the two Code nodes. After editing them, update those nodes in n8n and rerun the self-check. Imported workflows must reconnect the existing HA bearer credential and the read feed header credential.
