# Home Assistant Wall Dashboard

Norsk, berøringsvennlig dashboard for en veggmontert tablet. Det leser status fra Home Assistant, utfører handlinger via serveren og bekrefter resultatet ved å hente oppdatert entity-state etterpå.

## Lokal kjøring

```bash
cp .env.example .env
# Legg inn HA_TOKEN i .env
set -a && . ./.env && set +a
npm install
npm run start
```

For lokal utvikling med automatisk klientoppdatering, bruk `npm.cmd run dev` og åpne `http://127.0.0.1:5173`. Dette er den eneste lokale dashboard-adressen; API-et på port 3000 brukes bare internt av Vite. Legg lokale Home Assistant-verdier i `.env` først.

## Portainer

1. Opprett en ny **Stack** i Portainer og velg Compose-filen `docker-compose.portainer.yml`.
2. Legg inn disse stack-miljøvariablene (ikke legg tokenet i Compose-filen):
   - `HA_URL` = `http://192.168.1.78:8123`
   - `HA_TOKEN` = en Home Assistant long-lived access token
   - `DASHBOARD_PORT` = ønsket ekstern port, for eksempel `3000`
   - `HA_HOME_MODE_ENTITY_ID` = husmodus-entiteten. Standard er `input_select.home_mode`.
   - `HA_GUEST_MODE_ENTITY_ID` = riktig Gjestemodus-entity. Standard er `input_boolean.gjest`.
   - `HA_GUEST_VOUCHER_SENSOR_ID` = voucher-sensoren. Standard er `sensor.67647a4bca314858fac0f8fc_voucher`.
   - `HA_GUEST_VOUCHER_CREATE_BUTTON_ID` = knappen som oppretter voucher. Standard er `button.67647a4bca314858fac0f8fc_create`.
   - `HA_DOORBELL_CAMERA_ENTITY_ID` = kameraet i ringeklokke-kortet. Standard er `camera.ringeklokke_fluent`.
   - `HA_COURTYARD_CAMERA_ENTITY_ID` = kameraet i Gårdsplassen-kortet. Standard er `camera.gaardsplass_fluent_lens_0`.
   - `AI_REPORT_SECRET` = en ny, tilfeldig delt hemmelighet for n8n. Når den er satt, kan n8n sende den fullstendige AI-rapporten til `POST http://192.168.1.50:3100/api/ai-report` med headeren `X-AI-Report-Secret`.
   - `GIT_SYNC_REPO` = `https://github.com/Nutti85/homeassistantwalldash.git`
   - `GIT_SYNC_BRANCH` = `main`
3. Deploy stacken og åpne `http://<proxmox-eller-portainer-vert>:<DASHBOARD_PORT>` fra tableten.

`HA_GUEST_MODE_ENTITY_ID` kan overstyres dersom du vil bruke en annen Gjestemodus-entitet. Entiteten må være en `input_boolean`; dashboardet kaller `input_boolean.turn_on` og leser deretter samme entity tilbake som bekreftelse.

## n8n AI-rapport

Legg en HTTP Request-node på slutten av den nye n8n-workflowen:

```json
{
  "report": "{{$json.report}}",
  "publishedAt": "{{$now.toISO()}}"
}
```

Bruk strukturerte Markdown-overskrifter i `report`, for eksempel `## Kort oppsummert`, `## Vær`, `## Hjemmet` og `## Anbefalinger`. De vises som egne, lettleste seksjoner i Klara AI. `Personlig oversikt` og `Full rapport` trengs ikke som overskrifter. Bruk `POST`, URL `http://192.168.1.50:3100/api/ai-report`, header `X-AI-Report-Secret` med samme verdi som `AI_REPORT_SECRET`, og `Content-Type: application/json`. Rapporten lagres i minnet til dashboardet og vises når stjerneknappen nederst trykkes. Etter en container-omstart sender workflowen bare neste rapport på nytt.

For knappen **Oppdater** i Klara AI, sett `N8N_AI_REPORT_REFRESH_URL` til den aktive n8n-webhooken for briefing-workflowen. Dashboardet ber n8n starte en ny rapport og viser fremdrift til den publiserte rapporten er oppdatert.

Webhooken mottar `{ "mode": "on_demand", "requestedAt": "..." }` ved manuell oppdatering og `{ "mode": "coming_home", "requestedAt": "..." }` når `group.family` går fra borte til `home`. Manuelle rapporter viser de fem neste døgnbolkene kronologisk (`Natt`, `Morgen`, `Formiddag`, `Ettermiddag`, `Kveld`). Morgenplanen viser resten av dagen, kveldsplanen viser neste natt og morgendag, og hjemkomstrapporten begrenses til omtrent de neste 12 timene. Planlagte og nye publiserte rapporter åpnes automatisk i dashboardet.

## Temperatur

Temperaturknappene blir aktive først når climate-entiteten rapporterer et faktisk settpunkt i attributtet `temperature`. Den nåværende enheten rapporterer bare `current_temperature`, som vises som målt romtemperatur. Dette hindrer dashboardet i å anta at en målt temperatur er et ønsket settpunkt.
