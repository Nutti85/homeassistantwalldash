# Kalenderstyrt avreisebriefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Track progress with the checkboxes below.

**Goal:** Bygg en automatisk briefing på veggskjermen for kommende kalenderhendelser som innebærer bilreise, med Waze-basert tur/retur, konservativt ladeestimat, vær, hjemkomst og bekledning.

**Architecture:** Home Assistant henter kvalifiserende hendelser fra delt kalender og publiserer normaliserte lister for turer, Waze-ruter og destinasjonsvær. Dashboardserveren kobler listene på stabil `trip_id`, validerer ferskhet og beregner energi, ladestopp, avreise og hjemkomst med rene TypeScript-funksjoner. React viser alle briefinger som er klare i én modal og lagrer bare lokal visningsstatus. ABRP er ikke integrert; ved to eller flere estimerte ladestopp anbefaler UI-et manuell kontroll i ABRP.

**Tech Stack:** Home Assistant 2026.9 calendar/template/Waze/REST actions, TypeScript, Express, React 18, Vitest og Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-05-calendar-departure-briefing-design.md`

## Låste produktregler

- Delt kalender er eneste kilde.
- En tur kvalifiserer når `location` er fysisk, eller når en lokal, personverntrygg aliasregel finner et troverdig sted i tittelen.
- Nettmøter, heldagshendelser, avlyste hendelser og hjem som destinasjon ignoreres.
- `Andreas` velger EQB, `Hege` velger Peugeot e-2008; begge eller ingen velger EQB. Begge biler vises alltid.
- Hendelser som slutter samme Oslo-dag og varer høyst 12 timer antas å være tur/retur. Andre hendelser vises som enveis med uavklart retur.
- Waze beregnes separat ut og hjem. Kalenderens sluttid er planlagt returavreise.
- Energiterskler: 15 % ved offentlig lader, 40 % på destinasjon, 20 % hjemme, maks 80 % etter offentlig lading og 15 % rekkeviddesikkerhet.
- Hvert ladestopp får fem minutters overhead. Ladetid vises som intervall og ikke falsk presisjon.
- Destinasjonslading antas å være null.
- Ved minst to ladestopp vises `Langtur – kontroller ruten i ABRP`; ingen konkrete ladere foreslås.
- Hjemmeladingsråd kan vises inntil 12 timer før avreise. Ingen bil eller lader styres automatisk.
- Automatisk popup kommer 15 minutter før beregnet avreise, tar hensyn til tilstedeværelse og blir stående til den lukkes. Etter hendelsesstart reduseres den til statusindikator.
- Lukket popup gjenåpnes ved minst 10 minutter tidligere avreise, ny destinasjon, endret foreslått bil, flere ladestopp eller flyttet hendelse.
- Flere samtidige turer samles i én modal. Bilkonflikter vises øverst og løses aldri automatisk.
- Ferskhetsgrenser: Waze 10 min, bil 30 min, hjemmevær 60 min, destinasjonsvær 2 t, kalender 20 min.

## Filkart

- Create `home-assistant/packages/calendar_departure_briefing.yaml`: kalenderuttrekk, lokale stedsaliaser, Waze-ruter og destinasjonsvær.
- Create `home-assistant/packages/calendar_departure_briefing.example-secrets.yaml`: nødvendige secret-navn uten reelle verdier.
- Create `docs/calendar-departure-briefing-setup.md`: installasjon, bilprofiler, aliaser, personvern og HA-validering.
- Modify `src/shared/entities.ts`: tre nye eksplisitt tillatte HA-entiteter og to person-entiteter.
- Modify `src/server/index.ts`: miljøoverstyringer og validerte bilprofiler.
- Modify `src/server/homeAssistant.ts`: bygg `departureBriefings` fra innhentede states.
- Modify `src/server/homeAssistant.test.ts`: henting, feilisolasjon og responskontrakt.
- Create `src/shared/departureBriefing.ts`: typer, konstanter og kildekontrakter.
- Create `src/server/departureBriefingConfig.ts`: streng parsing og validering av bilprofilene.
- Create `src/server/departureBriefingConfig.test.ts`: konfigurasjonstester uten server-side effects.
- Create `src/server/departureEnergy.ts`: energi- og ladeberegning.
- Create `src/server/departureEnergy.test.ts`: grense- og egenskapstester for energimodellen.
- Create `src/server/departureBriefing.ts`: kobling, ferskhet, vær, avreise, hjemkomst og revisjon.
- Create `src/server/departureBriefing.test.ts`: domenetester for én og flere turer.
- Modify `src/client/api.ts`: type for `departureBriefings` i `/api/states`.
- Create `src/client/DepartureBriefing.tsx`: samlet modal og kompakt statusindikator.
- Create `src/client/DepartureBriefing.test.tsx`: komponent- og tilgjengelighetstester.
- Modify `src/client/App.tsx`: popup-livssyklus, tilstedeværelse og lokal kvittering.
- Modify `src/client/App.test.tsx`: integrasjonstester og regresjon.
- Modify `src/client/styles.css`: briefingstiler i eksisterende Walldash-språk.
- Modify `README.md`: oppsettlenke og miljøvariabler.

---

### Task 1: Definer kontrakt og konfigurasjon

**Files:**
- Create: `src/shared/departureBriefing.ts`
- Create: `src/server/departureBriefingConfig.ts`
- Create: `src/server/departureBriefingConfig.test.ts`
- Modify: `src/server/index.ts`
- Modify: `README.md`

**Interfaces:**

```ts
export type VehicleId = 'eqb' | 'e2008';
export type SourceQuality = 'available' | 'stale' | 'unavailable' | 'unconfigured';

export interface VehicleProfile {
  usableBatteryKwh: number;
  fallbackRangeKm: number;
  averageDcKw: number;
  homeChargeLimitPercent: number;
  publicChargeMaxPercent: number;
}

export interface DepartureBriefingConfig {
  briefingLeadMinutes: 15;
  arrivalMarginMinutes: 10;
  chargerArrivalPercent: 15;
  destinationArrivalPercent: 40;
  homeArrivalPercent: 20;
  rangeSafetyPercent: 15;
  chargeStopOverheadMinutes: 5;
  materialChangeMinutes: 10;
  roundTripMaxHours: 12;
  preparationHorizonHours: 12;
}
```

- [ ] Skriv tester som avviser manglende, negative eller urealistiske bilprofilverdier.
- [ ] Kjør `npm.cmd test -- src/server/departureBriefingConfig.test.ts` og bekreft at testen feiler før parsing er implementert.
- [ ] Legg til miljøvariablene `EQB_USABLE_BATTERY_KWH`, `EQB_FALLBACK_RANGE_KM`, `EQB_AVERAGE_DC_KW`, `EQB_HOME_CHARGE_LIMIT_PERCENT`, `E2008_USABLE_BATTERY_KWH`, `E2008_FALLBACK_RANGE_KM`, `E2008_AVERAGE_DC_KW` og `E2008_HOME_CHARGE_LIMIT_PERCENT`.
- [ ] Fastslå faktisk EQB- og e-2008-variant fra eksisterende HA-attributter eller bilintegrasjonen. Legg reelle verdier i lokal deploy-konfigurasjon, ikke i Git. Stopp aktivering dersom variantene ikke kan verifiseres.
- [ ] Eksporter alle låste terskler fra én `DEFAULT_DEPARTURE_BRIEFING_CONFIG`; ikke dupliser tall i klient eller YAML.
- [ ] Dokumenter variablene og at `averageDcKw` skal være konservativt gjennomsnitt fra 15–80 %, ikke oppgitt toppeffekt.
- [ ] Kjør `npm.cmd test -- src/server/departureBriefingConfig.test.ts` og forvent PASS.
- [ ] Commit: `git commit -m "feat: define departure briefing configuration"`.

---

### Task 2: Lag Home Assistant-kildesensorene

**Files:**
- Create: `home-assistant/packages/calendar_departure_briefing.yaml`
- Create: `home-assistant/packages/calendar_departure_briefing.example-secrets.yaml`
- Create: `docs/calendar-departure-briefing-setup.md`

**Produces:**

- `sensor.klara_calendar_trips`, med `trips`-attributt.
- `sensor.klara_calendar_routes`, med `routes`-attributt.
- `sensor.klara_destination_weather`, med `forecasts`-attributt.

- [ ] Dokumenter først generiske akseptanseeksempler for fysisk sted, lokalt tittelalias, Teams-lenke, heldagshendelse, avlyst hendelse, hjemsted og to samtidige turer.
- [ ] Opprett triggerbasert kalendersensor som kjører ved HA-start, kalenderendring og hvert femte minutt. Kall `calendar.get_events` for de neste 48 timene.
- [ ] Filtrer etter de låste kvalifikasjonsreglene og behold inntil seks kommende turer sortert på start. Inkluder `summary`, men aldri rå `description` i sensorattributtene.
- [ ] Generer `trip_id` fra event-ID og aktuell starttid. En flytting skal gi ny ID; en vanlig refresh skal beholde samme ID.
- [ ] Les stedsaliaser fra `!secret klara_departure_place_aliases`, med ufarlige aliasnøkler og normaliserte destinasjoner. Eksempelfilen viser bare oppdiktede steder; reelle adresser forblir lokal HA-konfigurasjon. `location` vinner alltid. Et ukjent tittelsted gir ingen automatisk briefing.
- [ ] Finn person/bil fra tittel først, deretter beskrivelse, men publiser bare `person_hint` og `vehicle_hint`; ikke publiser beskrivelsen.
- [ ] Opprett Waze-oppslag for både `zone.home → destination` og `destination → zone.home`. Bruk fremtidig `time_delta`, `region: eu`, `vehicle_type: car`, `units: metric`, og velg laveste gyldige `duration` uavhengig av responsrekkefølge.
- [ ] Begrens Waze-oppfriskning til aktive turer i relevant horisont og publiser `observed_at` og `quality` per `trip_id`.
- [ ] Geokod norsk destinasjon lokalt via Kartverket og hent kompakt timevarsel fra MET. Behold bare værpunkter som overlapper hendelsen. Bruk identifiserende User-Agent fra `!secret klara_departure_user_agent`.
- [ ] Ikke send rå kalendertittel eller beskrivelse til Waze, Kartverket eller MET; bare normalisert destinasjon.
- [ ] Kjør Home Assistants konfigurasjonssjekk i test-/lokalmiljø. Forvent tre entiteter med samstemte `trip_id`-er og ingen secrets eller rå beskrivelser i states.
- [ ] Test manuelt i Developer Tools at to samtidige turer produserer to ruter, og at ett mislykket Waze-/værkall ikke fjerner den andre turen.
- [ ] Commit: `git commit -m "feat: add calendar travel source sensors"`.

---

### Task 3: Tillat og les de nye kildene

**Files:**
- Modify: `src/shared/entities.ts`
- Modify: `src/server/index.ts`
- Modify: `src/server/homeAssistant.ts`
- Modify: `src/server/homeAssistant.test.ts`
- Modify: `README.md`

**Interface:** `/api/states` skal fortsatt hente en fast allow-list og i tillegg returnere `departureBriefings` som separat toppnivåfelt.

- [ ] Skriv sviktende tester som forventer de tre kildene og konfigurerbare person-entiteter for Andreas og Hege.
- [ ] Legg til standard-ID-er for `sensor.klara_calendar_trips`, `sensor.klara_calendar_routes` og `sensor.klara_destination_weather`. Person-entitetene har tom standard og må verifiseres lokalt før aktivering.
- [ ] Legg til miljøoverstyringene `HA_CALENDAR_TRIPS_ENTITY_ID`, `HA_CALENDAR_ROUTES_ENTITY_ID`, `HA_DESTINATION_WEATHER_ENTITY_ID`, `HA_ANDREAS_PERSON_ENTITY_ID` og `HA_HEGE_PERSON_ENTITY_ID`.
- [ ] Bevar feilisolasjon: utilgjengelig destinasjonsvær skal ikke gjøre kalender, ruter, biler eller resten av dashboardet utilgjengelig.
- [ ] Test at vilkårlig entity-ID fra en nettleserforespørsel aldri videresendes til Home Assistant.
- [ ] Kjør `npm.cmd test -- src/server/homeAssistant.test.ts src/server/app.test.ts` og forvent PASS.
- [ ] Commit: `git commit -m "feat: expose departure briefing sources"`.

---

### Task 4: Implementer konservativ energi- og lademodell

**Files:**
- Create: `src/server/departureEnergy.ts`
- Create: `src/server/departureEnergy.test.ts`

**Interface:**

```ts
estimateTripEnergy(input: {
  outboundKm: number;
  returnKm?: number;
  currentSocPercent?: number;
  currentRangeKm?: number;
  batteryObservedAt?: string;
  profile: VehicleProfile;
  now: Date;
}): {
  quality: SourceQuality;
  requiredStartSocPercent?: number;
  stopCount?: number;
  publicChargeMinutes?: { min: number; max: number };
  estimatedArrivalSocPercent?: number;
  estimatedHomeSocPercent?: number;
  warnings: string[];
};
```

- [ ] Skriv tabelltester for enveis, tur/retur, tersklene 15/40/20 %, 15 % sikkerhetsmargin, 80 % ladetak, null til tre stopp og fem minutters overhead per stopp.
- [ ] Skriv test der observerbar full rekkevidde utledes som `currentRangeKm / (soc / 100)` og reduseres med sikkerhetsmarginen.
- [ ] Skriv test der ugyldig eller manglende rekkevidde bruker konservativ bilprofil.
- [ ] Skriv test der batteridata eldre enn 30 minutter fortsatt vises med alder, men `stopCount` og «nok strøm» utelates.
- [ ] Skriv test der behovet overstiger tillatt offentlig ladeforløp. Resultatet skal beholde tersklene og gi ABRP-varsel, ikke senke reservekrav.
- [ ] Modellér ladetid som energi delt på konservativ `averageDcKw`, rund utover til et intervall og legg til overhead. Ikke modeller ladekurve eller navngitte ladere.
- [ ] Sørg for monotone egenskaper: lengre distanse kan aldri redusere nødvendig SoC, stopp eller ladetid; høyere start-SoC kan aldri øke dem.
- [ ] Kjør `npm.cmd test -- src/server/departureEnergy.test.ts` og forvent PASS.
- [ ] Commit: `git commit -m "feat: estimate conservative EV charging needs"`.

---

### Task 5: Bygg briefing-domenet og serverresponsen

**Files:**
- Create: `src/server/departureBriefing.ts`
- Create: `src/server/departureBriefing.test.ts`
- Modify: `src/server/homeAssistant.ts`
- Modify: `src/client/api.ts`

**Produces per trip:** tittel, destinasjon, start/slutt, foreslått bil, begge bilers SoC/rekkevidde/alder, ut-/hjemrute, ladeestimat, avreise, briefingtid, hjemkomst, hjemmevær, destinasjonsvær, klær, kildekvalitet, konflikter og stabil `revisionKey`.

- [ ] Skriv sviktende tester for kobling av flere usorterte kildelister på `trip_id`; foreldreløse ruter eller værdata skal ignoreres.
- [ ] Skriv tester for personvalg: bare Andreas, bare Hege, begge, ingen og begge biler opptatt samtidig.
- [ ] Skriv tester for tur/retur når hendelsen slutter samme Oslo-dag og varer `<= 12h`, samt enveis ved ny kalenderdag, `> 12h`, manglende slutt og manglende Waze-retur.
- [ ] Beregn `departureAt = eventStart - arrivalMargin - outboundWaze - outboundCharge`, og `briefingAt = departureAt - 15 min`.
- [ ] Beregn `estimatedHomeAt = eventEnd + returnWaze + returnCharge`; legg ikke til skjult returbuffer.
- [ ] Beregn forsinkelse mot hendelsesstart, inkludert ladestopp. Bruk `Dra nå` når avreisetid er passert.
- [ ] Aggreger hjemmevær rundt avreise og destinasjonsvær over hele hendelsen. Generer klær fra laveste følte temperatur, nedbør og vind etter spesifikasjonen.
- [ ] Håndhev ferskhet separat per kilde. Manglende vær skal fjerne klesråd, ikke turen; gammel Waze skal markere avreisetid usikker; gammel bilstatus skal stoppe ladekonklusjonen.
- [ ] Lag tidlig hjemmeladingsråd når turen er innen 12 timer og nødvendig start-SoC er høyere enn dagens SoC. Hvis nødvendig SoC overstiger konfigurert ladegrense, si eksplisitt at hjemmelading alene ikke er nok.
- [ ] Sett `longTripWarning` ved minst to estimerte ladestopp. Teksten skal anbefale manuell planlegging i ABRP uten å late som stoppestedene er kjent.
- [ ] Lag `revisionKey` av `trip_id`, destinasjon, foreslått bil, stoppantall og avreisetid bøttet i 10-minutters materialitet. Små trafikkendringer skal ikke gjenåpne modal.
- [ ] Sorter briefinger på avreise og løft bilkonflikter til et eget toppnivåfelt.
- [ ] Utvid `/api/states` og klienttypen med `departureBriefings`, men behold eksisterende `states` uendret.
- [ ] Kjør `npm.cmd test -- src/server/departureBriefing.test.ts src/server/homeAssistant.test.ts src/client/api.test.ts` og forvent PASS.
- [ ] Commit: `git commit -m "feat: build calendar departure briefings"`.

---

### Task 6: Lag den samlede veggskjermbriefingen

**Files:**
- Create: `src/client/DepartureBriefing.tsx`
- Create: `src/client/DepartureBriefing.test.tsx`
- Modify: `src/client/styles.css`

- [ ] Skriv komponenttester for én tur, to turer, bilkonflikt, null/én/flere ladestopp, gammel data, manglende vær, `Dra nå`, forsinkelse og langturvarsel.
- [ ] Vis per tur: hendelse/destinasjon, avreise, kjøring/lading/totaltid, begge biler, vær hjemme, vær på destinasjonen, hjemkomst og bekledning.
- [ ] Fremhev foreslått bil visuelt, men gjør den andre bilens SoC og rekkevidde like lesbar. Vis kildealder ved stale data.
- [ ] Vis ladetid som intervall og merk beregningen `Anslag`.
- [ ] Vis bilkonflikter øverst i modal før individuelle turkort.
- [ ] Bruk eksisterende modal, typografi, farger og knappemønstre. Ingen ny visuell designretning.
- [ ] Sørg for dialogrolle, tilgjengelig navn, fokusfelle, Escape/lukkeknapp, fokusretur og tilstrekkelig kontrast.
- [ ] Lag kompakt statusindikator for turer etter hendelsesstart og manuell gjenåpning av aktiv briefing.
- [ ] Kjør `npm.cmd test -- src/client/DepartureBriefing.test.tsx` og forvent PASS.
- [ ] Commit: `git commit -m "feat: render departure briefing modal"`.

---

### Task 7: Integrer popup-livssyklus og tilstedeværelse

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/App.test.tsx`

- [ ] Skriv sviktende integrasjonstester for automatisk åpning når `briefingAt <= now < eventStartAt`.
- [ ] Test tilstedeværelse: Andreas-tur krever Andreas hjemme, Hege-tur krever Hege hjemme, begge/ingen krever minst én voksen hjemme, og ukjent status åpner likevel.
- [ ] Test at modal står til eksplisitt lukking, at refresh ikke gjenåpner samme revisjon, og at manuell åpning alltid virker.
- [ ] Test alle materialitetsregler: minst 10 minutter tidligere, ny destinasjon, endret bil, flere stopp og flyttet event gjenåpner; mindre trafikkendring gjør det ikke.
- [ ] Test at flere samtidige due-turer vises i samme modal og at en ny due-tur legges til uten å miste eksisterende innhold.
- [ ] Test at modal går over til statusindikator etter hendelsesstart og forsvinner etter at turen ikke lenger er aktiv.
- [ ] Lagre bare `{ tripId, revisionKey, dismissedAt }` lokalt; ikke lagre kalendertekst, destinasjon eller bildata.
- [ ] Integrer mot eksisterende briefingflyt uten å overskrive brukerens pågående endringer i `App.tsx`, `App.test.tsx`, `briefingModel.ts` eller `styles.css`.
- [ ] Kjør `npm.cmd test -- src/client/App.test.tsx src/client/DepartureBriefing.test.tsx` og forvent PASS.
- [ ] Commit: `git commit -m "feat: trigger contextual departure briefings"`.

---

### Task 8: Verifiser hele kjeden

**Files:**
- Modify: `docs/calendar-departure-briefing-setup.md`
- Modify: `README.md`

- [ ] Kjør full testpakke: `npm.cmd test`. Forvent alle tester grønne.
- [ ] Kjør typesjekk/build etter prosjektets eksisterende scripts: `npm.cmd run build`. Forvent exit code 0.
- [ ] Start lokal stack med `npm.cmd run dev`, åpne `http://127.0.0.1:5173`, og verifiser ingen feil i `.local-dev.log`.
- [ ] Bruk generiske HA-testhendelser for: kort tur uten lading, én ladestopp, langturvarsel, to samtidige turer og samme-bil-konflikt.
- [ ] Verifiser på faktisk veggskjermbredde at modal kan leses uten horisontal scrolling, at viktig avreisetid er synlig først, og at fokus/berøring fungerer.
- [ ] Simuler utilgjengelig Waze, gammel bilstatus og manglende destinasjonsvær hver for seg. Resten av dashboardet skal fungere, og briefingen skal være ærlig om hva den ikke vet.
- [ ] Verifiser at kalendertekst, beskrivelser, hjemmeadresse, HA-token og secrets ikke finnes i logger, lokal lagring, testfixtures eller nettleserkonsoll.
- [ ] Verifiser at ingen bil-/laderstyring, navigasjonsstart, n8n-endring eller Portainer-deploy er introdusert.
- [ ] Oppdater oppsettdokumentet med eksakte observerte entity-ID-er og bilprofilverdier, men ingen hemmeligheter.
- [ ] Be om kodegjennomgang, rett prioriterte funn, og kjør test/build på nytt før ferdigmelding.
- [ ] Commit: `git commit -m "docs: finalize departure briefing setup"`.

## Aktiveringsrekkefølge

1. Installer HA-pakken og verifiser de tre kildesensorene.
2. Konfigurer og valider eksakte bilprofiler og person-entiteter.
3. Aktiver serverberegningen og inspiser `/api/states` lokalt.
4. Aktiver UI-et lokalt med generiske testhendelser.
5. La funksjonen gå i observasjonsmodus uten automatisk popup gjennom minst én reell tur.
6. Slå på automatisk popup på veggskjermen når Waze-, batteri- og kalenderferskhet er bekreftet.

Produksjonsdeploy via Portainer er en separat, eksplisitt beslutning og inngår ikke i denne planen.
