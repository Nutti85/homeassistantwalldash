# Romklima tiltak – n8n-kontrakt

Dashboardet leser anbefalinger fra `sensor.romklima_tiltak` (kan overstyres med `HA_ROOM_CLIMATE_ADVICE_ENTITY_ID`). n8n skal skrive en Home Assistant-state med dette attributtet:

```json
{
  "rooms": {
    "living": { "tiltak": "Øk luftingen" },
    "bedroom": { "tiltak": "" },
    "child-bedroom": { "tiltak": "" },
    "bathroom": { "tiltak": "Øk ventilasjonen" }
  }
}
```

Tom eller manglende `tiltak` skjules. Returner kun én kort, handlingsrettet norsk setning per rom.

## Flow

1. Kjør ved endring av en romklima-entity og hvert femte minutt.
2. Hent temperatur, relativ luftfuktighet og CO₂ fra Home Assistant. Bad bruker kun temperatur og fuktighet.
3. Bevar de konfigurerte romtypene og reglene: temperatur, fuktighet og CO₂ vurderes per rom; CO₂ under 350 ppm er sensor-mistenkelig; bad skal tåle kortvarig fukttopp før tiltak anbefales.
4. Be modellen kun foreslå tiltak når minst én måling ikke er `good`. Den skal ikke finne på målinger eller anbefale tiltak for manglende CO₂ på badet.
5. Valider modellens resultat til maks én `tiltak`-tekst per rom, og skriv resultatet tilbake til sensoren.

## Prompt-kjerne

Gi modellen de faktiske målingene, preklassifiserte statuser og eventuell varighet/trend. Be den velge én av korte anbefalinger, som `Øk luftingen`, `Skru opp varmen`, `Senk temperaturen`, `Vurder luftfukter` eller `Øk ventilasjonen`. Den skal returnere tom tekst når alle relevante verdier er gode.
