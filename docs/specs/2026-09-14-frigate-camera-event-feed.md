# Kamera­hendelser i Siden sist

## Status og omfang

- Opprettet: 2026-09-14
- Status: Godkjent for bygging
- Mål: V2-dashboardet på `codex/dashboard-prototype-v2`
- Erstattet modul: `SIST MENS HUSET VAR BORTE`

## Brukerbehov

WallDash skal gi et trygt, enkelt overblikk over faktiske kamera­hendelser – med siste bilde på forsiden og klipp på forespørsel – uten å sende brukeren videre til Frigate eller eksponere interne adresser og legitimasjon.

## Låste produktvalg

- Den nye modulen heter `KAMERAHENDELSER` og står først i `SIDEN SIST`, der `SIST MENS HUSET VAR BORTE` står i dag.
- Vis kun Frigate-objektene `person`, `car` og `dog`; `cat` og øvrige objektklasser ekskluderes.
- Inkluder kameraene `Bakside`, `Bod`, `Gaardsplassen_Wide` og `Hagen`, med alle deres review-soner som kontekst. Soner prioriteres ikke.
- En review inkluderes bare når dens `start_time` faller i en periode der `input_number.toggle_security_mode` var `1` (Armert) eller `2` (Notifikasjoner). `3` (Deaktivert) ekskluderes. En review som starter i 1/2 beholdes selv om modus senere blir 3.
- Grupper reviews med samme kamera og samme sone når deres starttidspunkter ligger innenfor et ti-minuttersvindu. Én review med flere relevante objekter er fortsatt én hendelse; objektetiketten samles, for eksempel `Person og bil`.
- Hvert kort viser nyeste snapshot fra gruppen, kamera, sone, klokkeslett, detekterte objekter og en rund teller for antall reviews i gruppen. Kortet/bildet åpner detaljvisning.
- Forsiden viser fem nyeste grupper. Detaljvisningen har inntil sju dagers historikk, galleri og metadata for gruppens reviews. Valgt bilde endrer valgt review; `Spill klipp` spiller den valgte reviewens Frigate-preview i modalen. Ingen omdirigering til Frigate og ingen autoplay.
- Når media er utløpt, beholdes metadata og vises med norsk tilgjengelighetsmelding i stedet for ødelagt bilde eller spiller.
- Når sikkerhetsmodus akkurat nå er 3, vises `Overvåkning er ikke aktiv.` Når ingen kvalifiserte grupper finnes de siste sju dagene, vises `Ingen kamerahendelser de siste sju dagene.`
- `Hendelser`-tidslinjen beholdes som sekundær modul og viser også de samme grupperte Frigate-deteksjonene som tekst, eksempelvis `Person og bil registrert · Parkering · Gårdsplassen`.
- Bekreftede Frigate-reviews oppdaterer dashboardet umiddelbart. Vanlig, synlighetsstyrt polling hvert 30. sekund beholdes som reserve.

## Integrasjonsdesign

Frigate er kilde for review-metadata, thumbnail og klipp. Home Assistant er kilde for historikken til sikkerhetsmodus. Dashboard-serveren gjør alle oppslag og utsteder kun same-origin media-capabilities til nettleseren.

1. Serveren henter maksimalt sju døgn med Frigate reviews og Home Assistant-historikk for sikkerhetsmodus.
2. Den filtrerer objektklasser og review-starttid mot modusintervallene, grupperer kvalifiserte reviews og utsteder kortlivede media-capabilities for hver valgt review.
3. Frigate MQTT `frigate/reviews` mottas med en dedikert konto som bare har subscribe-tilgang til dette topicet. Kun `end`-meldinger (ferdig review) publiseres som en ugyldiggjøringshendelse.
4. Serveren videresender ugyldiggjøringen på en same-origin SSE-rute. Klienten refetche `GET /api/activity`; MQTT-payloaden sendes aldri til nettleseren.

## Datakontrakt

Utvid `ActivityPayload` med en eksplisitt kamera-feed. Behold `timeline` for øvrige hjemhendelser, men fjern avhengigheten av `awayCapture` fra klienten når kamera-modulen er erstattet.

```ts
export type CameraEventStatus = 'available' | 'expired' | 'none' | 'unavailable' | 'inactive';

export interface CameraReview {
  id: string;
  occurredAt: string;
  objects: Array<'person' | 'car' | 'dog'>;
  camera: string;
  zone?: string;
  monitoringMode: 'armed' | 'notifications';
  thumbnailPath?: string;
  mediaPath?: string;
}

export interface CameraEventGroup {
  id: string;
  occurredAt: string;
  camera: string;
  zone?: string;
  objects: Array<'person' | 'car' | 'dog'>;
  reviewCount: number;
  latestReviewId: string;
  reviews: CameraReview[];
}

export interface CameraEventFeed {
  status: CameraEventStatus;
  groups: CameraEventGroup[];
}
```

`GET /api/activity` returnerer den utvidede typen. `GET /api/activity/updates` er en SSE-strøm med navngitt `activity`-event og uten person- eller kamerapayload. `/api/activity/review/:id/preview` og `/thumbnail` er fortsatt de eneste mediarutene.

## Konfigurasjon og tilgang

Eksisterende V2-miljøvariabler fylles med den eksplisitte Home Assistant-allowlisten med 12 `image.*`-entiteter for person, bil og hund samt `FRIGATE_URL=http://192.168.1.66:5000`.

Legg til følgende tomme, dokumenterte variabler uten hemmeligheter i Git:

```dotenv
FRIGATE_MQTT_URL=
FRIGATE_MQTT_USERNAME=
FRIGATE_MQTT_PASSWORD=
FRIGATE_MQTT_TOPIC=frigate/reviews
```

En separat MQTT-konto opprettes før produksjonsaktivering, med kun subscribe-tilgang til `frigate/reviews`. Den faktiske URL-en og legitimasjonen settes bare som Portainer V2 stack environment variables og må aldri logges eller sendes til klienten.

## Feil, ytelse og sikkerhet

- Behold siste bekreftede feed ved midlertidig feil; vis eksisterende stale-varsel etter gjeldende terskel.
- Hvis MQTT ikke er konfigurert eller kobles fra, skal REST-feed og 30-sekunders polling fortsatt fungere.
- Tidlig `new`/`update`-MQTT ignoreres; bare review `end` utløser refresh. Serveren tåler duplikater og reconnect uten event-storm.
- Begrens Frigate-oppslag, ikke persistér bilder/klipp, og valider review-ID, kamera, media-content-type og alle browser-synlige stier.
- Detaljmodalen må være tastaturnavigerbar, fange fokus, lukke på Escape/bakgrunnsklikk og gjenopprette fokus. Galleri-valg og teller må ikke bare kommuniseres med farge.

## Akseptanseksempler

1. En `person`-review i `Parkering` på `Gaardsplassen_Wide` ved modus 2 vises som kort og som tekstlinje i tidslinjen.
2. En `cat`-review og en `dog`-review ved modus 3 vises ikke.
3. To kvalifiserte reviews fra samme kamera og sone med seks minutters mellomrom gir ett kort med teller 2 og nyeste bilde.
4. To reviews fra samme kamera men ulike soner gir to kort.
5. Når valgt review mangler preview eller thumbnail, forblir tidspunkt, kamera, sone og objekter synlige med korrekt norsk utilgjengelighetstekst.
6. Frigate `end` på MQTT fører til én klient-refresh uten at Frigate/MQTT-data eksponeres i EventSource.
