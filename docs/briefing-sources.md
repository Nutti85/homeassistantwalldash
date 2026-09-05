# Kilder for levende briefing

Dette dokumentet beskriver bare valgte entity-id-er og begrensninger. Det inneholder ikke token, VIN, adresser eller komplette Home Assistant-snapshots.

## Valgte bindinger

| Behov | Standardbinding | Behandling |
| --- | --- | --- |
| Andreas batteri | `sensor.ee14199_state_of_charge` | Brukes med kildeklokke; ikke antatt fersk bare fordi dashboardet hentes på nytt. |
| Andreas rekkevidde | `sensor.ee14199_range_electric` | Estimat, ikke garanti for at en tur kan gjennomføres. |
| Andreas lademål | `sensor.ee14199_max_state_of_charge` | Leses som faktisk mål når tilgjengelig. |
| Andreas ladeeffekt/status | `sensor.ee14199_charging_power`, `sensor.ee14199_charging_status` | Krever fersk verdi; numeriske statuskoder tolkes ikke uten dokumentert integrasjonsbetydning. |
| Andreas avreise | `sensor.ee14199_departure_time` | Kombineres med datert arbeidsdag før jobbreise vises. |
| Felleslader | `sensor.el_bil_lader_klaras_vei_14_*` | Tilkobling og aktiv lading sier ikke alene hvilken bil som lader. Effekt normaliseres fra W til kW. |
| Kalender | `calendar.outlook_andreas_felles` | Kalender-API-et hentes med et eksplisitt datointervall; event-ID, gjentakelse, sted og rutemetadata bevares. |
| Jobbreise | Valgfri `HA_ANDREAS_TRAVEL_TIME_ENTITY_ID` | Ingen fast reisetid brukes når kilden mangler, er gammel eller ikke gjelder aktuell adresse. |
| Arbeidsdag | Valgfri datert kalender/helper via `HA_WORKDAY_TODAY_ENTITY_ID` og `HA_WORKDAY_TOMORROW_ENTITY_ID` | Ukjent eller udaterte kilder gir ingen skråsikker jobbreise. En aktivert automatisering er ikke arbeidsdagdata. |

## Ferskhet og språk

- Bil- og ladedata må ha en kildeklokke (`last_reported`, `last_updated`, `last_changed` eller dokumentert attributt) for å kunne brukes som ferske.
- Ladeobservasjoner eldre enn 30 minutter behandles som ukjente. Verifisert rutetid eldre enn 5 minutter brukes ikke til avreiseberegning.
- Direkte biltilordning vises som bekreftet. Sammenfallende fersk bil- og ladeeffekt vises som sannsynlig. Ved konflikt eller ukjent bil vises bare at hjemmeladeren er i bruk.
- Manglende vær-, varsel-, kalender- eller ladegrunnlag uttrykkes med vanlig norsk tekst. Det vises ikke «Ingen varsler» når varselkilden ikke kan kontrolleres.

Bindingene kan overstyres med miljøvariablene i `.env.example`. Produksjonens miljøvariabler skal bevares ved Portainer-oppdatering.
