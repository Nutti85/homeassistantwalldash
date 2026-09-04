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

På enkelte Windows-maskiner med Node 24 feiler `tsx` før serverkoden starter fordi Node-kallet `os.userInfo()` returnerer `uv_os_get_passwd` med `ENOMEM`. Dev-launcheren forhåndslaster derfor `scripts/node-os-userinfo-fallback.cjs`, som bare håndterer akkurat denne kjente Windows-feilen og bruker `USERNAME`/`USERPROFILE` som lokal fallback. Ikke patch `node_modules` eller fjern `tsx`; produksjonscontaineren bruker sin egen Linux-runtime.

### Feilsøking lokalt: «Kunne ikke oppdatere smarthuset»

Denne meldingen vises når dashboardet ikke får et gyldig svar fra `GET /api/states`. Den kan derfor dukke opp selv om Klara AI-rapporten er tilgjengelig. Unngå å åpne eller bruke `http://127.0.0.1:3000` i nettleseren; bruk alltid `http://127.0.0.1:5173`.

Sjekk API-et i PowerShell fra prosjektroten:

```powershell
Invoke-WebRequest http://127.0.0.1:5173/api/states -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:5173/api/ai-report -UseBasicParsing
```

Begge skal normalt svare med status `200` (`/api/ai-report` kan også svare `204` når ingen rapport er publisert). Hvis `/api/states` feiler, gjør dette:

1. Kontroller at `.env` finnes, at `HA_URL` peker på riktig Home Assistant-instans, og at `HA_TOKEN` er en gyldig long-lived access token. Ikke lim tokenet inn i terminal, logger eller Git.
2. Stopp bare denne prosjektets utviklingsserver med `Ctrl+C` i terminalen der `npm.cmd run dev` kjører.
3. Start én ny server fra prosjektroten:

   ```powershell
   npm.cmd run dev
   ```

4. Oppdater siden på `http://127.0.0.1:5173`. Ikke start en ekstra kopi; den skal bruke API-port `3000` og Vite-port `5173`.

Hvis kommandoen over fortsatt ikke gir `200`, er årsaken forbindelse eller autentisering mot Home Assistant, ikke nettleserens cache. Bekreft at Home Assistant er nåbar fra denne maskinen og opprett eventuelt et nytt token i Home Assistant før du starter utviklingsserveren på nytt.

Hvis port 3000 eller 5173 er opptatt, identifiser prosessen med `netstat -ano` og kontroller kommando og arbeidsmappe før den stoppes. Ikke stopp en annen apps listener. For en isolert lokal kontroll når API-port 3000 er opptatt, kan du midlertidig bruke en annen API-port uten å endre filer:

```powershell
$env:PORT = '3001'
$env:DASHBOARD_API_PROXY_TARGET = 'http://127.0.0.1:3001'
npm.cmd run dev
```

Åpne fortsatt `http://127.0.0.1:5173`; stopp hele dev-prosesstreet med `Ctrl+C` etter kontrollen og bekreft at 3001/5173 ikke lenger har `LISTENING`-prosesser.

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
   - `HA_ROOM_CLIMATE_ADVICE_ENTITY_ID` = n8n-sensoren for korte romklima-tiltak. Standard er `sensor.romklima_tiltak`.
   - `AI_REPORT_SECRET` = en ny, tilfeldig delt hemmelighet for n8n. Når den er satt, kan n8n sende den fullstendige AI-rapporten til `POST http://192.168.1.50:3100/api/ai-report` med headeren `X-AI-Report-Secret`.
   - `GIT_SYNC_REPO` = `https://github.com/Nutti85/homeassistantwalldash.git`
   - `GIT_SYNC_BRANCH` = `main`
3. Deploy stacken og åpne `http://<proxmox-eller-portainer-vert>:<DASHBOARD_PORT>` fra tableten.

`HA_GUEST_MODE_ENTITY_ID` kan overstyres dersom du vil bruke en annen Gjestemodus-entitet. Entiteten må være en `input_boolean`; dashboardet kaller `input_boolean.turn_on` og leser deretter samme entity tilbake som bekreftelse.

## n8n AI-rapport

Legg en HTTP Request-node på slutten av den nye n8n-workflowen:

```json
{
  "title": "{{$json.title}}",
  "report": "{{$json.report}}",
  "mode": "{{$json.mode}}",
  "publishedAt": "{{$now.toISO()}}"
}
```

Bruk strukturerte Markdown-overskrifter i `report`, for eksempel `## Kort oppsummert`, `## Vær`, `## Kalender`, `## Hjemmet` og `## Anbefalinger`. Kalenderen kan bruke `### I dag` og `### I morgen`; dashboardet viser da hovedoverskriften `Senere`. Hvis bare én av dagene finnes, blir hovedoverskriften henholdsvis `Senere i dag` eller `I morgen`. De øvrige seksjonene vises som egne, lettleste deler i Klara AI. `Personlig oversikt` og `Full rapport` trengs ikke som overskrifter. Feltet `mode` er valgfritt, men anbefales og kan være `full`, `morning`, `midday`, `afternoon` eller `evening`. Bruk `POST`, URL `http://192.168.1.50:3100/api/ai-report`, header `X-AI-Report-Secret` med samme verdi som `AI_REPORT_SECRET`, og `Content-Type: application/json`. Rapporten lagres på dashboardets persistente volum og vises når stjerneknappen nederst trykkes. Nye publiserte rapporter åpnes automatisk, også etter en dashboard-omstart.

Sett `N8N_AI_REPORT_REFRESH_URL` til den aktive n8n-webhooken for briefing-workflowen. Klara AI viser knappene **Full rapport**, **Morgen**, **Formiddag**, **Ettermiddag** og **Kveld** og viser fremdrift til den publiserte rapporten er oppdatert.

Webhooken mottar `{ "mode": "full", "requestedAt": "..." }`, `{ "mode": "morning", "requestedAt": "..." }`, `{ "mode": "midday", "requestedAt": "..." }`, `{ "mode": "afternoon", "requestedAt": "..." }` eller `{ "mode": "evening", "requestedAt": "..." }`. `on_demand` støttes fortsatt av hensyn til eldre kall og behandles som `full`.

Rapportperiodene i n8n og outputen er: `Natt` 23:00–06:00, `Morgen` 06:00–09:00, `Formiddag` 09:00–15:00, `Ettermiddag` 16:00–19:00 og `Kveld` 19:00–23:00. Mellomrommet 15:00–16:00 har bevisst ingen navngitt periode. Morgenrapporten prioriterer morgen og reise til jobb, skole og barnehage 07:30–09:30 på arbeidsdager. Ettermiddagsrapporten prioriterer 16:00–19:00, aktiviteter og kalenderhendelser. Kveldsrapporten prioriterer resten av kvelden, natten og morgendagens første avtaler. Full rapport er den detaljerte oversikten. Planlagte kjøringer (06:30 og 22:00) beholdes uendret; den interne `bedtime`-modusen for 22:00 publiseres som den kanoniske modusen `evening`, slik at dashboardet viser **Kveldsbriefing**.

Klara AI viser først en strukturert oversikt basert på det siste Home Assistant-øyeblikksbildet og værvarselet for den valgte perioden. Oversikten har alltid fast rekkefølge for værmålingene (vær, temperatur, vind, nedbør og bekledning) og de praktiske områdene (kalender, reise, skole, barnehage, hjemmet og varsler). Temperatur avrundes til nærmeste 0,5 °C, vind til hele m/s og nedbør til én desimal. Manglende kildedata vises eksplisitt som `Ikke tilgjengelig`; den opprinnelige n8n-Markdownen ligger fortsatt under **Vis detaljer**.

## Temperatur

Temperaturknappene blir aktive først når climate-entiteten rapporterer et faktisk settpunkt i attributtet `temperature`. Den nåværende enheten rapporterer bare `current_temperature`, som vises som målt romtemperatur. Dette hindrer dashboardet i å anta at en målt temperatur er et ønsket settpunkt.
