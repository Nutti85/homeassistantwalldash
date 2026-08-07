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

Åpne `http://localhost:3000`. For utvikling med automatisk klientoppdatering, bruk `npm run dev` sammen med en terminal som kjører serveren.

## Portainer

1. Opprett en ny **Stack** i Portainer og velg Compose-filen `docker-compose.portainer.yml`.
2. Legg inn disse stack-miljøvariablene (ikke legg tokenet i Compose-filen):
   - `HA_URL` = `http://192.168.1.78:8123`
   - `HA_TOKEN` = en Home Assistant long-lived access token
   - `DASHBOARD_PORT` = ønsket ekstern port, for eksempel `3000`
   - `HA_GUEST_MODE_ENTITY_ID` = riktig Gjestemodus-entity. Standard er `input_boolean.gjest`.
   - `GIT_SYNC_REPO` = `https://github.com/Nutti85/homeassistantwalldash.git`
   - `GIT_SYNC_BRANCH` = `main`
3. Deploy stacken og åpne `http://<proxmox-eller-portainer-vert>:<DASHBOARD_PORT>` fra tableten.

`HA_GUEST_MODE_ENTITY_ID` kan overstyres dersom du vil bruke en annen Gjestemodus-entitet. Entiteten må være en `input_boolean`; dashboardet kaller `input_boolean.turn_on` og leser deretter samme entity tilbake som bekreftelse.

## Temperatur

Temperaturknappene blir aktive først når climate-entiteten rapporterer et faktisk settpunkt i attributtet `temperature`. Den nåværende enheten rapporterer bare `current_temperature`, som vises som målt romtemperatur. Dette hindrer dashboardet i å anta at en målt temperatur er et ønsket settpunkt.
