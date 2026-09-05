# Plan: levende rapporter med råd i god tid

> **For agentic workers:** Bruk superpowers:executing-plans ved gjennomføring, oppgave for oppgave. Planen er bestilt; implementering og produksjonssetting er ikke utført.

**Goal:** Gi familien korte, oppdaterte rapporter som følger dagen, sier fra mens det fortsatt er tid til å gjøre noe, og følger opp før avreise.

**Architecture:** Rapportens periode styres av Oslo-tid, og innholdet bygges fra normaliserte Home Assistant-data og faste regler. Kalender, reise og ladebehov får egne modeller; kortet og rapportvinduet bruker samme grunnlag. AI er valgfritt og skal aldri være nødvendig for å vise fakta eller velge periode.

**Tech Stack:** Eksisterende React, TypeScript, Express, Home Assistant og Vitest. Ingen ny database eller komponentpakke i første versjon.

**Spec:** Beslutningene under og den godkjente visuelle retningen i [rapportprototypen](C:/Users/andra/.codex/visualizations/2026/09/05/01a07280-0f19-72d0-9260-325cf6e781fd/rapportprototyper-dagens-stil.html). Prototypens navn, tider, reiser og ladeberegninger er eksempeldata og skal ikke kopieres som familieinnstillinger. Denne planen erstatter rapportavhengig periodevalg i planforslaget fra 4. september, uten å overskrive den eldre filen.

## Felles krav

- Behold AI-rapportens eksisterende CSS, Inter, Material Symbols, mørkegrønne flater, varme aksenter, fem vær-/klesfelt og praktiske rutenett. Ingen ny visuell profil.
- Bruk vanlig norsk bokmål, kort og konkret. Ikke vis entitetsnavn, regler, datakontrakter eller modellbegreper i den vanlige oversikten.
- Alle tidsregler bruker `Europe/Oslo`, også rundt midnatt og sommertid.
- Arbeidsreise vises på arbeidsdager før relevant avreise. Kalenderreise kan vises alle dager. Mandag–fredag er ikke bevis på at noen skal på jobb.
- Lading varsles mens det er praktisk å koble til, normalt kvelden før. Kontroller status før avreise. Hvis behovet oppdages tidligere og ladingen tar lang tid, vis rådet allerede da.
- Ikke anta at en tilkoblet felleslader betyr at en bestemt bil lader. Ikke anta at «lademål nådd» betyr at alle turer kan gjennomføres.
- Hent manglende entiteter selv gjennom eksisterende HA-tilgang. Kontroller betydning og ferskhet før bruk. Ikke opprett eller endre HA-automatiseringer bare for å kartlegge.
- Ikke styr lading, låser eller andre enheter fra rapporten i dette arbeidet.
- Ikke kopier token, VIN, private adresser eller komplette HA-snapshots til dokumentasjon eller tester.
- Produksjon endres bare ved uttrykkelig bestilt Portainer-deploy. Bevar eksisterende miljøvariabler og legitimasjon.

## Avtalt oppførsel

| Visning | Tid i Oslo | Hva den hjelper med |
|---|---|---|
| Morgen | 06–09 | Avreise, bilstatus, klær, sekker og dagens første avtaler |
| Formiddag | 09–15 | Neste aktiviteter og ting som bør gjøres før ettermiddagen |
| Ettermiddag | 15–19 | Henting, fritidsaktiviteter, reise og vær som kommer |
| Kveld | 19–23 | Lading, pakking og avfall før morgendagen |
| Natt | 23–06 | Rolig status og avvik som trenger oppfølging; ingen automatisk popup |
| Neste døgn | Rullerende 24 timer fra nå | Forberedelser, avtaler og oppfølging i tidsrekkefølge |

Natt er et tillegg fra prototypen som lukker døgnet. Automatisk visning følger klokken. Manuelt valg av en annen rapport gjelder bare i det åpne rapportvinduet; dashboardkortet fortsetter å følge tiden. Vis dato tydelig når en manuelt valgt periode gjelder neste dag. Tilby «Nå» for å gå tilbake, og nullstill manuelt valg når vinduet lukkes.

Tre viktige saker kan oppsummeres øverst. Praktiske kategorier vises når de har nyttig innhold; ikke fyll rutenettet med tomme reiserader. Aktive alvorlige varsler skal ikke forsvinne bak en vilkårlig grense på tre saker. Færre relevante saker gir en kortere rapport.

## Dagligdags språk

| Unngå | Skriv heller |
|---|---|
| Ladestatus utilgjengelig | Får ikke sjekket ladingen nå. |
| Rekkeviddemargin er tilstrekkelig | Bilen ser ut til å ha nok strøm til turen. |
| Koble til innen beregnet tidsvindu | Koble til bilen i kveld. |
| Estimert ferdigstillelse | Ser ut til å være ferdig rundt kl. 06. |
| Ingen relevant planpunkt | Ingenting å huske fra skolen i dag. |
| Prognose mangler | Får ikke hentet værmeldingen nå. |
| Delvis prognose | Har værmelding frem til kl. 17. |
| Avvik fra forventet ladestatus | Bilen lader ikke. Sjekk kabelen. |

Den siste formuleringen krever at det faktisk er bekreftet at bilen ikke lader og at kabelkontroll er et relevant råd. Ved ukjent status brukes «Får ikke sjekket ladingen nå». «Ingen skole i dag» brukes bare når vi vet at det er skolefri; manglende plan er ikke skolefri.

Eksempler på en sammenhengende tur:

- Kveld: «Koble til bilen i kveld. Du skal dra kl. 07:35 i morgen.»
- Kveld med godt datagrunnlag: «Den trenger omtrent fem timer på laderen.»
- Morgen: «Bilen har 80 % batteri. Ladingen er ferdig.»
- Forsinket: «Bilen blir neppe ferdig før du skal dra. Sjekk om du kan ta den andre bilen.» Ikke lov at den andre bilen er tilgjengelig.
- Ukjent: «Får ikke sjekket batteriet nå. Se i bilappen før du drar.»

Skriv ikke automatisk «du» hvis avtalen tilhører en bestemt person; bruk for eksempel «Andreas skal dra …». Opplysningene skal ha samme navn og tidsreferanse gjennom hele rapporten.

## Kartlegging utført 5. september 2026

Leste HA `/api/states` med eksisterende lokal konfigurasjon. Dette er en kartlegging av kilder, ikke garanti for at de alltid er oppdaterte.

| Behov | Entitet / funn | Bruk og videre kontroll |
|---|---|---|
| Andreas, batteri | `sensor.ee14199_state_of_charge` | Har `timestamp` og `retrievalstatus`; bruk kildeferskhet |
| Andreas, rekkevidde | `sensor.ee14199_range_electric` | Estimat, ikke garanti |
| Andreas, lademål | `sensor.ee14199_max_state_of_charge` | Rapporterte 80; ikke hardkod 80 for alle biler |
| Andreas, ladeeffekt | `sensor.ee14199_charging_power` | kW; kontroller tid og om bilen faktisk lader |
| Andreas, ladestatus | `sensor.ee14199_charging_status` | Numerisk kode; dokumenter betydningen fra integrasjonen før bruk |
| Andreas, ferdig ladet | `sensor.ee14199_end_of_charge` | Var `unknown`; ingen beregnet sluttid fra denne nå |
| Andreas, avreisetid | `sensor.ee14199_departure_time` | Rapporterte 07:35, har `departureTimeWeekday`; må tolkes sammen med modus og ukedag |
| Hege, drivbatteri | `sensor.vr3ukzkxzmj881373_battery` | Bruk drivbatteriet, ikke `service_battery` |
| Felleslader, modus | `sensor.el_bil_lader_klaras_vei_14_charger_mode` | Rapporterte `connected_charging` |
| Felleslader, effekt | `sensor.el_bil_lader_klaras_vei_14_charge_power` | W; normaliser til kW |
| Kabel tilkoblet | `binary_sensor.el_bil_lader_klaras_vei_14_plug` | Bekrefter tilkobling til laderen, ikke hvilken bil |
| Lading pågår | `binary_sensor.el_bil_lader_klaras_vei_14_charging` | Bruk sammen med tilkobling og kontaktstatus |
| Lader på nett | `binary_sensor.el_bil_lader_klaras_vei_14_connectivity` | Avgjør om laderstatus kan brukes |
| Alternative bilkilder | `binary_sensor.eqb_300_4matic_charging`, `binary_sensor.e_2008_charging` | Var `unknown`; flere dubletter er utilgjengelige. Ikke velg første treff |
| Jobbreise | `sensor.waze_travel_time` | Var `unavailable`; Hege har ingen konfigurert kilde i dashboardet |
| Arbeidsdag | Navnesøk fant arbeidsdag-automatiseringer, ingen bekreftet arbeidsdagsensor | Undersøk hjelpere og kalender; automatisering `on` betyr bare at den er aktivert |

Kalendermodellen i `dashboardModel.ts` beholder i dag tittel, start, slutt og heldag, men ikke reisemål. Dette må utvides før kalenderbasert reisetid kan fungere.

n8n-kartlegging fant aktiv `Klara Contextual Daily Briefing` (`HykUlLyO8ZkV8FtS`) og `Home Dashboard Refresh` (`IezTocAYhR4QhuG4`). Bare metadata er lest. Undersøk triggere og andre mottakere før eventuelle endringer; ikke skru av delte arbeidsflyter blindt.

## Filer og ansvar

- `src/shared/briefing.ts` (ny): periode-, kilde-, tur- og ladegrunnlagstyper.
- `src/shared/entities.ts`, `src/server/index.ts`: eksplisitte valgfrie entitetsbindinger.
- `src/server/briefingSources.ts` (ny): normalisering av bil, lader og arbeidsdag; ingen enhetsstyring.
- `src/server/homeAssistant.ts`, `src/server/app.ts`: hente og eksponere normalisert grunnlag uten hemmeligheter.
- `src/client/briefingPeriod.ts` (ny): periodevalg og Oslo-datogrenser.
- `src/client/briefingTravel.ts` (ny): relevans og avreiseberegning fra verifisert reisetid.
- `src/client/briefingAdvice.ts` (ny): forberedelser og oppfølging, inkludert lading.
- `src/client/briefingCopy.ts` (ny): norske formuleringer for faste tilstander.
- `src/client/briefingModel.ts`: samle vær, praktiske saker og kildekvalitet.
- `src/client/dashboardModel.ts`: bevare sted og kalenderidentitet uten å ødelegge eksisterende kalendervisning.
- `src/client/BriefingOverview.tsx`, `src/client/App.tsx`, `src/client/api.ts`: vise levende rapport og riktig navigasjon.
- `src/client/styles.css`: kun nødvendige tilpasninger i eksisterende rapportstil.
- Tester ved siden av modulene, samt eksisterende `App.test.tsx` og servertester.

## Oppgave 1: Verifiser kilder og normaliser data

- [ ] Hent relevante entiteter på nytt; undersøk bare nødvendige attributter. Finn arbeidsdag/ferie, biltilordning, ladekodebetydning og rutekilde. Dokumenter valgte bindinger i `docs/briefing-sources.md` og valgfrie navn i `.env.example`.
- [ ] Utled hvilken bil som lader fra bilenes egne sensorer. Kombiner fersk positiv ladeeffekt/ladestatus, stigende drivbatteri over flere målinger, samsvar i tid med hjemmeladeren og kjent plassering når tilgjengelig. Normaliser W/kW og tolerer avrunding og ulik oppdateringstakt. En gammel verdi fra den andre bilen er ikke bevis på at den ikke lader. Numerisk statuskode skal tolkes fra integrasjonen, ikke gjettes.
- [ ] Skill mellom bekreftet, sannsynlig og ukjent biltilordning. Direkte verifisert tilknytning gir «Andreas sin bil lader hjemme». Sammenfallende effekt og batteristigning uten direkte tilknytning gir «Det ser ut som Andreas sin bil lader hjemme». Ved konflikt eller gamle kilder vises bare «Hjemmeladeren er i bruk». At en bil lader er ikke alene bevis på at den lader hjemme. Behold vurderingen bare innen samme ladeøkt, og nullstill ved frakobling eller foreldet grunnlag.
- [ ] Bevar kilde- og hentetid. En ny HTTP-henting gjør ikke en gammel bilavlesning fersk. Ikke bruk `last_changed` alene, fordi uendret verdi kan være fersk.
- [ ] Lag testdata uten personopplysninger for ukjent status, null effekt, W/kW, numerisk statuskode, foreldet batteri, bytte av bil, to biler som lader samtidig, lading borte og sannsynlig samsvar mellom bil/lader. Kjør testen før implementering og bekreft forventet feil.
- [ ] Implementer normalisering og valgfrie bindinger. Foreslått grense før avreise: bilavlesning maks 30 min, rutetid maks 5 min. Ukjent kildeklokke gir ukjent ferskhet; juster kun etter dokumentert integrasjonskadens.
- [ ] Kjør `npm.cmd test -- src/server/briefingSources.test.ts src/server/homeAssistant.test.ts src/server/app.test.ts` og kontroller at vanlige dashboarddata fortsatt fungerer.

Kontrakt i `src/shared/briefing.ts`:

```ts
export type Reading<T> = {
  value?: T;
  observedAt?: string;
  fetchedAt: string;
  quality: 'available' | 'stale' | 'unknown' | 'unconfigured';
};
export type Trip = {
  id: string;
  startsAt: string;
  person?: string;
  vehicle?: 'andreas' | 'hege';
  destination?: string;
  kind: 'commute' | 'calendar';
  minutes?: Reading<number>;
  distanceKm?: Reading<number>;
};
```

## Oppgave 2: Frikoble rapportperioden fra AI

- [ ] Skriv `briefingPeriod.test.ts` med grenseverdier 06, 09, 15, 19, 23 og midnatt, samt begge sommertidsskiftene. Test gammelt morgeninnhold kl. 16 uten noen ny AI-publisering.
- [ ] Kjør `npm.cmd test -- src/client/briefingPeriod.test.ts` og bekreft at ny funksjon mangler før implementering.
- [ ] Flytt Oslo-hjelpere fra `briefingModel.ts`; innfør `currentBriefingMode(now: Date)` og `resolveBriefingPeriod(mode, now)` uten `publishedAt`.
- [ ] For inneværende periode brukes nå og resterende varsel; ikke krev prognose for timer som allerede er forbi. Full rapport bruker nå til nå + 24 timer. Manuelt neste-periodevalg viser tilhørende dato.
- [ ] Koble til minuttopptikk og umiddelbar oppdatering ved fokus/synlighet. Dashboardkortet må fungere når `/api/ai-report` gir 404 eller feil.
- [ ] Kjør periodetestene, `briefingModel.test.ts` og relevante `App.test.tsx`-tester.

Eksempel på fast regresjonstest:

```ts
expect(currentBriefingMode(new Date('2026-09-05T14:00:00Z')))
  .toBe('afternoon'); // 16:00 i Oslo
```

## Oppgave 3: Kalenderreise og arbeidsdager

- [ ] Bevar kalenderens event-ID, location og start/slutt i backend og klient. Filtrer hendelser etter faktisk dato, også heldagshendelser, gjentakelser og avlysninger.
- [ ] Skriv tester for vanlig arbeidsmorgen, helg, ferie/fridag, hjemmekontor, fysisk helgeavtale, nettmøte, manglende adresse, gammel rutetid og avsluttet avtale.
- [ ] Lag `relevantTrips(trips: Trip[], now: Date, isWorkday: boolean | undefined): Trip[]`. Jobbreise krever bekreftet arbeidsdag og planlagt avreise; ukjent arbeidsdag skal ikke gi skråsikker jobbmelding.
- [ ] Hent rutetid for rett startsted og reisemål med eksisterende verifisert rutekilde. Hvis ingen dynamisk rutekilde finnes, vis avtalen/stedet og «Får ikke beregnet reisetiden nå». Ikke bruk fast Waze-jobbtid til en annen adresse eller hjemreise.
- [ ] Avreise = avtalestart minus reisetid minus ankomstmargin. Start med 10 min ankomstmargin som dokumentert innstilling; vis reiser innen to timer før avreise. Håndter forsinkelse frem til avtalestart, og fjern ferdige reiser.
- [ ] Kjør `npm.cmd test -- src/client/briefingTravel.test.ts src/client/dashboardModel.test.ts src/server/homeAssistant.test.ts`.

## Oppgave 4: Råd med forberedelse og oppfølging

- [ ] Definer `Advice` med stabil ID, `prepareAt`, `dueAt`, `reviewAt`, `expiresAt`, kategori, alvorlighet og underliggende kildekvalitet. Reberegn fra samme tur-ID; ikke lag gjentatte nye varsler for samme behov.
- [ ] Skriv tester for kveld → morgen, fredag → helg, søndag → mandag, ferdig lading, stoppet lading, manglende biltilordning og for kort tid igjen.
- [ ] Bruk bilens troverdige sluttidsestimat først. Beregn ellers ladetid bare med dokumentert brukbar batterikapasitet, gyldig ladestatus, effekt og mål. Ikke kopier prototypens fem timer eller én times margin som universell sannhet.
- [ ] Hvis estimat finnes: beregn startfrist fra avreise minus anslått ladetid og en konfigurerbar margin (første forslag 60 min). Vis kveldspåminnelsen ved 19, eller tidligere hvis fristen krever det. Hvis estimat mangler: «Koble til bilen i kveld» ved kjent behov, uten et oppdiktet klokkeslett.
- [ ] Bruk bilens faktiske lademål. «Nok strøm til turen» krever kjent bil, fersk oppgitt rekkevidde og tur/retur med margin; bruk et dokumentert startforslag på 30 % ekstra rekkevidde, merk vurderingen som anslag. Uten kjørelengde rapporteres bare batteri og ladestatus.
- [ ] Klær/gymtøy/skolesekk forberedes kvelden før og følges opp om morgenen. Avfall vises kvelden før og på hentedagen. Ukedagstreff må ikke gjenbruke en gammel skoleuke; udaterte oppslag blir ikke automatisk dagens aktivitet.
- [ ] Kjør `npm.cmd test -- src/client/briefingAdvice.test.ts src/client/briefingModel.test.ts src/client/weeklyPlan.test.ts`.

## Oppgave 5: Dagligdags tekst og eksisterende utseende

- [ ] Lag `briefingCopy.ts` fra språkeksemplene over. Hold fakta og formulering adskilt. Ingen AI trengs for omskriving av vanlige statusmeldinger.
- [ ] Test at ukjent batteri aldri gir «ferdig», at tom skoleplan ikke gir «skolefri», og at manglende varselkilder ikke gir «Ingen varsler». En teknisk kildedetalj kan ligge under «Vis detaljer».
- [ ] Koble samme modell til dashboardkort og rapportvindu. Bruk rapportens eksisterende komponenter og CSS; la antall praktiske felt følge relevans. Ingen tom rad for en ukonfigurert valgfri reisetid.
- [ ] Gjør rapportknappene til periodevalg, ikke AI-bestilling. Tilby «Nå» og «Neste døgn». Vis datatid bare når den er sann: unngå global «Oppdatert nå» hvis bil eller kalender er gammel.
- [ ] Fjern automatisk åpning som følge av AI-publisering fra standardrapportflyten. Behold eventuelt gammelt AI-innhold adskilt og tidsmerket under detaljer inntil opprydding er verifisert.
- [ ] Test navigasjon, fokus, live periodebytte, skjerm som våkner etter natten, ingen AI-rapport, manglende vær og feil på én kilde. Kjør `npm.cmd test -- src/client/App.test.tsx src/client/briefingModel.test.ts src/client/api.test.ts`.

## Oppgave 6: Reduser AI-avhengighet og verifiser helheten

- [ ] Behold klesreglene som grunnfunksjon. AI-forbedrede klesråd er en separat valgfri oppfølging; ikke nødvendig for første leveranse. AI kan senere tolke aktiviteter, men skal ikke bestemme bilstatus, varsler eller reisetid.
- [ ] Les de to oppdagede n8n-arbeidsflytene via MCP. Kartlegg alle mottakere og triggere før et konkret forslag om å fjerne unødvendige genereringer. Backend-API og publiseringsmottak beholdes kompatible inntil avhengighetene er avklart.
- [ ] Kjør `npm.cmd test` og `npm.cmd run build` én gang når deltestene passerer. Rett reelle feil og kjør berørte tester på nytt.
- [ ] Start lokal utvikling med `npm.cmd run dev`. Følg AGENTS.md: undersøk eksisterende prosesser/logg først; preview er kun `http://127.0.0.1:5173`. Ikke bruk port 3000 som dashboard.
- [ ] Sammenlign visuelt med dagens AI-rapport og prototypen på veggskjerm og smal skjerm. Kontroller alle seks perioder samt helg, kalenderreise, sen lading og ukjent status. Test faktiske lange kalender- og skoletekster uten å kopiere private data til permanente fixtures.
- [ ] Kontroller og stopp bare egen verifisert prosessgruppe etter sjekkene. Bekreft at prosjektets porter er frigitt.
- [ ] Lever en kort endringsoversikt og lokale testresultater. Ved en senere uttrykkelig deploybestilling: gjenoppdag Portainer-miljø og stack `homeassistant-wall-dashboard`, bevar miljøvariabler, deploy og verifiser produksjon. Ikke bruk lokal Docker.

## Ferdigkriterier

- Dashboardkort og automatisk rapport følger klokken uten AI-generering eller sideoppfriskning.
- Morgenens utløpte prognose gir ikke tomme felt i ettermiddagen.
- Laderådet kommer tidsnok; status følges opp før avreise og usikkerhet uttrykkes ærlig.
- Ingen jobbpendling på en kjent fridag; relevant kalenderreise fungerer også i helgen.
- Ukjent tilstand, gammel avlesning og ukonfigurert kilde behandles forskjellig.
- Rapporten snakker dagligdags norsk og ser ut som dagens AI-rapport.
- Ingen bil-/hjemmestyring, produksjonsdeploy eller endring av n8n er utført som del av planleggingen.
