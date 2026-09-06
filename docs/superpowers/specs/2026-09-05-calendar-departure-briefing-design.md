# Kalenderstyrt avreisebriefing – design

## Problem

Familien trenger en kort briefing like før de faktisk må dra hjemmefra til en kalenderavtale som krever bilreise. Dette er ikke den faste arbeidsreisevisningen: reisemål, tidspunkt, opphold, bilvalg, tur/retur og mulig ladebehov kommer fra den konkrete kalenderhendelsen.

Dagens dashboard har kalenderstart/-slutt, hjemmevær, timevarsel og batteri/rekkevidde for begge biler. Kalendermodellen kaster imidlertid bort `location`, den eksisterende Waze-sensoren gjelder jobb, og det finnes ikke en stabil kontrakt for flere kommende kalenderreiser, destinasjonsvær eller ladeestimat.

## Mål

Når en kvalifiserende kalenderreise nærmer seg, skal veggskjermen automatisk åpne en briefing 15 minutter før beregnet avreise. Briefingen skal svare på:

- Når må vi dra, og hvor lang tid tar turen nå?
- Har bilene nok strøm til tur/retur med de avtalte batterigrensene?
- Hvor mange offentlige ladestopp anslås, hvor lenge varer de og hva blir total reisetid?
- Hvordan er været hjemme ved avreise?
- Hvordan blir været på destinasjonen mens kalenderhendelsen varer?
- Når er vi omtrent hjemme igjen?
- Hva bør vi ha på oss på destinasjonen?

## Brukskontekst

Briefingen er systeminitiert og leses i en travel overgang på en veggskjerm. Den viktigste informasjonen må være forståelig på få sekunder, uten tekniske sensornavn eller falsk presisjon. Fakta, anslag og usikkerhet skal være tydelig forskjellige.

## Beslutninger fra grilling

- Kildekalender er bare den eksisterende delte Outlook-kalenderen.
- Første versjon gjelder bare bilturer.
- En hendelse kvalifiserer når et fysisk reisemål finnes i `location`, eller når et troverdig stedsnavn kan isoleres fra tittelen.
- Waze er rutekilde. ABRP API integreres ikke i første versjon.
- Ved langturer med to eller flere anslåtte ladestopp skal briefingen anbefale kontroll i ABRP, men ikke kalle ABRP automatisk.
- Minimum SoC er 15 % ved offentlig ladestopp, 40 % ved arrangementsstedet og 20 % hjemme etter returen.
- Offentlig hurtiglading modelleres fra 15 % mot maksimalt 80 %.
- Tur/retur antas automatisk når hendelsen slutter samme Oslo-dag og varer maksimalt 12 timer.
- Kalenderens slutt betyr at arrangementet er ferdig; ingen ekstra returmargin legges til.
- Begge biler vises alltid.
- Andreas betyr Mercedes EQB; Hege betyr Peugeot e-2008. Begge eller ingen navn betyr EQB som standard.
- Tidlig hjemmeladingsråd inngår, men systemet styrer aldri lading eller lademål.
- Popup vises bare på veggskjermen i første versjon.

## Kvalifisering og stedsutledning

En hendelse regnes som en kalenderreise når alle disse kravene er oppfylt:

- Den har starttid i fremtiden og er ikke en heldagshendelse.
- Den er ikke avlyst.
- Den er ikke bare et nettmøte; `Teams`, `Zoom`, `Meet`, `Webex` og rene møtelenker filtreres bort.
- `location` inneholder et fysisk sted som ikke er hjemmet, eller tittelen kan gi et troverdig sted gjennom lokal parsing.
- Den er ikke eksplisitt merket `#ingenreise`, `#gå`, `#sykkel` eller `#kollektiv`.

Stedsutledning følger denne rekkefølgen:

1. Bruk trimmet `location` når den finnes.
2. Uten `location`: fjern lokalt kjente personnavn og aktivitetsord fra tittelen.
3. Slå opp gjenværende stedsdel i en lokal aliasliste, for eksempel `Ekeberg → Ekeberg idrettspark, Oslo`.
4. Send bare utledet stedsdel/adresse til Waze og geokoding, aldri rå kalendertittel eller beskrivelse.
5. Hvis stedsdelen ikke kan isoleres eller ruteres entydig, behold hendelsen i vanlig kalender, men ikke utløse automatisk avreisebriefing.

## Bilvalg

Personnavn søkes i tittel først og deretter beskrivelse:

1. Bare `Andreas`: fremhev `Mercedes EQB`.
2. Bare `Hege`: fremhev `Peugeot e-2008`.
3. Begge eller ingen: fremhev `Mercedes EQB`.

Begge biler vises med batteriprosent og rekkevidde når tilgjengelig. `Foreslått bil` er en visuell prioritering, ikke en reservasjon eller garanti om tilgjengelighet.

Hvis samtidige reiser peker på samme bil, skal systemet ikke omfordele bilen. Det viser: `To reiser ser ut til å bruke EQB samtidig. Sjekk bilfordelingen.` Den andre bilen vises som mulig alternativ uten å bli lovet ledig.

## Rute- og tidsmodell

For hver tur hentes Waze-rute begge veier. Utreise beregnes for forventet avreise; retur beregnes med kalenderslutt som fremtidig tidspunkt.

- `event_start_at`: start fra kalenderen.
- `event_end_at`: slutt fra kalenderen.
- `outbound_drive_minutes`: Waze fra `zone.home` til reisemålet.
- `return_drive_minutes`: Waze fra reisemålet til `zone.home` ved kalenderslutt.
- `arrival_buffer_minutes`: 10 minutter.
- `outbound_charge_minutes`: konservativt beregnet offentlig ladetid før destinasjonen.
- `return_charge_minutes`: konservativt beregnet offentlig ladetid etter destinasjonen.
- `departure_at = event_start_at - outbound_drive_minutes - outbound_charge_minutes - 10 minutter`.
- `briefing_at = departure_at - 15 minutter`.
- `estimated_home_at = event_end_at + return_drive_minutes + return_charge_minutes`.

Hvis Waze endrer anbefalt avreise minst 10 minutter tidligere, åpnes briefingen én gang til. Senere avreise oppdaterer den manuelle visningen uten en ny avbrytelse.

Når anbefalt avreise er passert, viser briefingen `Dra nå` og forventet forsinkelse. Etter kalenderstart lukkes automatisk modal og erstattes av en liten statusindikator.

## Tur/retur-regel

Tur/retur modelleres automatisk bare når hendelsen:

- har gyldig sluttid;
- slutter på samme kalenderdag i `Europe/Oslo`; og
- varer maksimalt 12 timer.

Andre hendelser planlegges én vei og viser `Retur er ikke beregnet`. Kalenderens varighet brukes som oppholdstid på destinasjonen. Destinasjonslading antas alltid å være null i første versjon.

## Ladeestimat uten ABRP

Ladeestimatet er et konservativt energibudsjett, ikke en ladeplan. Det velger ikke konkrete ladestasjoner.

### Grunnlag

- Start-SoC fra bilens ferske Home Assistant-sensor.
- Oppgitt rekkevidde fra samme bil.
- Utreise- og returdistanse fra Waze.
- Momentan full rekkevidde utledes som `range_km / (soc_percent / 100)`.
- Utledet rekkevidde reduseres med 15 % sikkerhetsmargin.
- Ved fersk SoC, men manglende eller ulogisk rekkevidde, brukes en konservativ, konfigurert bilprofil. Er selve batteristatusen eldre enn ferskhetsgrensen, beregnes verken «nok strøm» eller antall ladestopp.
- Bilprofilen inneholder brukbar batterikapasitet og konservativ gjennomsnittlig DC-ladeeffekt, validert for eksakt EQB- og e-2008-variant.

### Batterigrenser

- Minst 15 % ved ankomst til offentlig lader.
- Minst 40 % ved ankomst til arrangementsstedet.
- Minst 20 % ved hjemkomst.
- Offentlig lading modelleres fra 15 % og opp til maksimalt 80 %.

### Resultat

Modellen beregner:

- nødvendig start-SoC;
- om hjemmelading til bilens konfigurerte lademål kan fjerne eller forkorte offentlig lading;
- anslått antall offentlige ladestopp;
- nødvendig energi og ladetid;
- total reisetid inkludert fem minutters stopp-overhead per lading.

Ladetid vises som avrundet intervall. Ved to eller flere stopp vises `Langtur – kontroller ruten i ABRP`. Hvis kravene ikke kan oppfylles, senkes aldri tersklene; vis `Turen kan ikke gjennomføres innen batterigrensene uten lading. Planlegg ladestopp i ABRP.`

## Tidlig hjemmeladingsråd

Inntil 12 timer før avreise sammenlignes faktisk start-SoC med nødvendig start-SoC og bilens konfigurerte lademål.

- Hvis hjemmelading kan fjerne eller forkorte offentlig lading: `Koble til EQB hjemme.`
- Hvis hjemmelading ikke rekker eller lademålet er for lavt: vis nødvendig start-SoC, dagens lademål og forventet offentlig ladebehov.
- Systemet skal ikke endre lademål, starte lading eller anta at en felleslader tilhører en bestemt bil.

Denne funksjonen var tidligere planlagt, men er ikke implementert i dagens kode. Den inngår eksplisitt i denne leveransen.

## Vær og bekledning

- Hjemmevær hentes fra eksisterende timevarsel i vinduet rundt beregnet avreise.
- Destinasjonen geokodes fra den rensede adressen/stedsdelen.
- Destinasjonsvær hentes fra MET Locationforecast og klippes til kalenderstart–kalenderslutt.
- Ved enveisreise uten relevant slutt brukes et begrenset værvindu fra ankomst.
- Hvis destinasjonsvær mangler, brukes aldri hjemmeværet som erstatning.

Bekledningsrådet er regelstyrt fra destinasjonsvarselet:

- Laveste følte temperatur bestemmer hovedlag.
- Nedbørssannsynlighet minst 40 % eller nedbør minst 0,2 mm gir paraply/regntøy.
- Vindkast minst 10 m/s gir vindtett lag.
- Uten destinasjonstemperatur gis ikke et oppdiktet klesråd.

## Home Assistant-kontrakt

Home Assistant eier kalenderuttrekk, ruterespons og destinasjonsvær som eksplisitt tillatte entiteter. Dashboardserveren validerer disse kildene og beregner ladebehov, avreise, hjemkomst og om en briefing skal vises. Fordi flere reiser kan være samtidige, inneholder sensorene lister med samme stabile `trip_id` i alle kilder.

### `sensor.klara_calendar_trips`

State er antall kvalifiserende turer de neste 48 timene. Attributtet `trips` inneholder:

```yaml
- trip_id: "event-42|2026-09-08T16:00:00+02:00"
  summary: "Tannlege"
  destination: "Eksempelveien 1, Oslo"
  event_start_at: "2026-09-08T16:00:00+02:00"
  event_end_at: "2026-09-08T17:00:00+02:00"
  round_trip: true
  vehicle_hint: "eqb"
  person_hint: "andreas"
  observed_at: "2026-09-08T13:00:00+02:00"
  quality: "available"
```

`trip_id` kombinerer kildeevent-ID og aktuell start. Dermed blir en flyttet hendelse en ny varslingsforekomst, mens vanlige sensoroppdateringer ikke lager duplikater.

### `sensor.klara_calendar_routes`

State er antall turer med gyldig Waze-rute. Attributtet `routes` inneholder per `trip_id`:

```yaml
- trip_id: "..."
  outbound_minutes: 24
  outbound_distance_km: 19.2
  return_minutes: 27
  return_distance_km: 19.5
  observed_at: "2026-09-08T15:05:00+02:00"
  quality: "available"
```

Waze-data eldre enn 10 minutter regnes som gammel nær avreise.

### `sensor.klara_destination_weather`

State er antall turer med destinasjonsvarsel. Attributtet `forecasts` grupperer timepunkter per `trip_id` og inneholder koordinater, `observed_at`, kvalitet og normaliserte temperatur-, nedbør-, vind- og tilstandsverdier.

### Beregnet dashboardkontrakt

Dashboardserveren kobler kildene på `trip_id` og returnerer en `departureBriefings`-liste sammen med de øvrige dashboarddataene. Hver briefing inneholder `departure_at`, `briefing_at`, ladeestimat, nødvendig start-SoC, hjemmeladingsråd, estimert hjemkomst og kildekvalitet.

Klienten regner en briefing som klar for automatisk visning når:

```text
briefing_at <= now < event_start_at
```

Dette vurderes ved hver vanlige dashboardoppdatering og ved fokus/tilkobling, slik at ingen separat due-sensor eller minutt-automatisering er nødvendig i Home Assistant.

## Dashboardopplevelse

Briefingen bruker eksisterende Klara-stil og modalatferd. Flere samtidige turer vises i én modal, sortert etter tidligste avreise. Bilkonflikt vises øverst.

For hver tur vises:

1. Hendelse, reisemål og `Dra kl. HH:MM` eller `Dra nå`.
2. Kjøretid, lading og total tid.
3. Begge biler; foreslått bil får sterkere kant/fyll og badge.
4. Vær hjemme ved avreise.
5. Vær på destinasjonen mens hendelsen varer.
6. `Hjemme ca. HH:MM` eller ærlig manglende retur.
7. Bekledning.

Modalen blir stående til noen lukker den. Den åpnes én gang per varslingsrevisjon og kan gjenåpnes manuelt. Automatisk åpning skjer bare når relevant person er hjemme:

- Andreas-tur: Andreas hjemme.
- Hege-tur: Hege hjemme.
- Begge/ingen: minst én av Andreas eller Hege hjemme.
- Ukjent personstatus: åpne likevel.

## Ny varslingsrevisjon

En lukket modal åpnes på nytt bare når:

- avreise flyttes minst 10 minutter tidligere;
- destinasjonen endres;
- foreslått bil endres;
- anslått antall ladestopp øker; eller
- kalenderhendelsen flyttes til et nytt tidspunkt.

Senere avreise, bedre batteri eller andre mindre endringer oppdaterer innholdet uten ny modal.

## Feil- og usikkerhetstilstander

- Uklart sted i tittel: `Fant ikke reisemålet`; ingen automatisk popup.
- Manglende Waze-rute: vis kalenderstart, men ikke beregn avreise.
- Gammel Waze-rute: vis `Reisetiden kan ha endret seg` og oppdater.
- Manglende slutt/flerdagstur: `Retur er ikke beregnet`.
- Manglende destinasjonsvær: `Får ikke hentet været på stedet`; ingen klesanbefaling.
- Batteridata eldre enn 30 minutter: vis siste verdi og alder; ingen konklusjon om nok strøm eller antall ladestopp.
- Nødvendig start-SoC over 100 %: behold batterigrensene og anbefal eksplisitt ruteplanlegging i ABRP.
- Samtidige turer og samme bil: vis konflikt, ikke automatisk omfordeling.
- Stale data fra tidligere tur: forkast når `trip_id` ikke matcher.

Ferskhetsgrenser:

- Waze: 10 minutter nær avreise.
- Bil: 30 minutter.
- Hjemmevær: 60 minutter.
- Destinasjonsvær: 2 timer.
- Kalender: 20 minutter.

## Konfigurasjon

Disse verdiene samles i serverkonfigurasjon og får ikke dashboardkontroller i første versjon:

```text
briefing lead: 15 min
arrival margin: 10 min
charger arrival: 15 %
destination arrival: 40 %
home arrival: 20 %
public charge ceiling: 80 %
range safety margin: 15 %
charge stop overhead: 5 min
material traffic change: 10 min
same-day round-trip limit: 12 timer
preparation horizon: 12 timer
```

## Ikke-mål

- Fast arbeidsreise eller skole-/barnehagelogistikk uten kalendersted.
- Gange, sykkel eller kollektivtransport.
- Automatisk valg/reservasjon, oppvarming, lading eller endring av lademål.
- Valg av konkrete offentlige ladestasjoner uten en faktisk ladeplanlegger.
- Redigering av sted eller alias fra veggskjermen.
- Mobilvarsling eller lyd/TTS.
- AI-generert fakta, reisetid eller bekledningsråd.
- ABRP API-kall eller produksjonsdeploy som del av første versjon.

## Akseptansekriterier

1. Fysiske bilturer fra delt kalender kvalifiserer via `location` eller et trygt utledet stedsnavn; nettmøter og alternative transportformer filtreres bort.
2. Flere samtidige reiser bevares og vises samlet uten overskriving.
3. Popup åpnes innen ett dashboardpoll etter 15-minuttersgrensen og følger personens hjemmestatus.
4. Avreise inkluderer Waze-kjøretid, 10 minutters ankomstmargin og anslått offentlig lading.
5. Begge biler vises; Andreas/Hege styrer fremheving, ellers EQB.
6. Ladeestimatet håndhever 15/40/20 %, 80 % ladetak og 15 % rekkeviddemargin.
7. Hjemmeladingsråd vises opptil 12 timer før når det kan redusere offentlig lading.
8. Hjemmevær og destinasjonsvær er tydelig forskjellige, og klesråd bruker bare destinasjonsvær.
9. Hjemkomst bruker kalenderslutt, Waze-retur og anslått returlading uten ekstra sluttmargin.
10. Forsinkelse, flytting, avlysning, manglende/gamle data, samtidige turer, bilkonflikt og omstart er testet.
11. Eksisterende jobb-, kalender-, bil- og Klara-visninger fortsetter å fungere.

## Kildegrunnlag

- Home Assistant kalenderkilder støtter eventdata og automasjon, men leses normalt hvert 15. minutt: https://www.home-assistant.io/integrations/calendar/
- Waze-handlingen støtter dynamisk start/destinasjon, fremtidig `time_delta` og returnerer varighet og distanse: https://www.home-assistant.io/actions/waze_travel_time.get_travel_times/
- Triggerbaserte template-entiteter kan kjøre handlinger med responsdata og bevare state over omstart: https://www.home-assistant.io/integrations/template/
- REST-kommandoer støtter templated URL og responsvariabel: https://www.home-assistant.io/integrations/rest_command/
- MET Locationforecast krever identifiserende `User-Agent`: https://api.met.no/weatherapi/locationforecast/2.0/documentation
