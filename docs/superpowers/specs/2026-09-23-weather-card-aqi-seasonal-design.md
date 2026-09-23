# Weather card J: implementation specification

## Reference and scope

Implement the selected **variant J** from `C:\Users\andra\.codex\visualizations\2026\09\22\01a0cafb-d12e-7622-8eee-371361645252\weather-aqi-pollen-mockup.html?variant=j` in the V2 dashboard's default weather slot. The mockup supplies layout, hierarchy, icons, and color direction; its numbers are example data. Follow `docs/dashboard-redesign/IMPLEMENTATION_BRIEF.md` and the existing V2 surfaces in `src/client/styles.css`. Keep V1 and the detailed weather page functional. Preserve the card's pointer, Enter, and Space action that opens detailed weather.

## Visual and content contract

- One full-width card with three open rows: current weather and wind; AQI and a seasonal signal side by side; a three-column measurement rail. No small boxed tiles under the divider.
- Current condition glyph about 52 px. Show temperature at approximately 38 px and a thick, standalone colored arrow immediately to its right for rising/falling trend; a horizontal arrow for stable. Put only `Følt som N°C` below. Do not show the condition name there. Wind compass is before wind speed and gust text; make its directional icon about 44 px. All directions and values use live sensors.
- AQI always occupies the left signal slot. Show a value, Norwegian category name, category icon/color, and the six-band scale from variant E. The current band must be indicated by a position marker and a textual category, so color is never the only signal. Label it **US AQI** to identify the index used. No invented or stale numeric value may appear.
- The right signal slot shows the most relevant available pollen type and level during pollen season. Outside the season, prioritize an active MeteoAlarm warning, then forecast frost overnight, then the next sunrise/sunset. If none is available, show a quiet unavailable state rather than an invented forecast. Pollen is considered in season only when `pollenForecast` is available and at least one species sensor has a valid numeric level; a valid level `0` still counts and displays `Ingen`.
- Measurement rail: pressure value + hPa, pressure class and colored thick trend arrow; outdoor humidity value + percent and subtle track; **Regn siste time** as primary value, `I dag: N mm` as secondary. Pressure class: `Lavtrykk` at or below 1008 hPa, `Høytrykk` at or above 1018 hPa, `Normalt trykk` between them, only when the source is a valid hPa reading. Missing readings show `—` and no class. Preserve direction words for assistive technology.
- At V2 landscape card width, fit without clipping or card overlap. At narrow widths, stack the two signals and then wind as needed. Keep sufficient contrast, a visible focus ring, and no nested button inside the clickable card.

## Data and behavior

- Existing weather, Netatmo, pollen, MeteoAlarm, and sun values come from the current `/api/states` pipeline. Choose the highest pollen level; break ties in this order: alder, birch, grass, hazel, mugwort, willow. Map species to Norwegian names and keep the detailed weather pollen display consistent.
- `sensor.air_quality` in the connected Home Assistant currently reports `0` without AQI unit/attributes and was last updated on 2026-09-20. It is not a usable index source. Fetch `current.us_aqi` from the official Open-Meteo Air Quality API on the server. Use coarse Sandefjord coordinates `59.1,10.2` by default, overridable with `AQI_LATITUDE` and `AQI_LONGITUDE`; never transmit HA credentials. The client reads a same-origin `/api/air-quality` endpoint. Open-Meteo's API documentation: https://open-meteo.com/en/docs/air-quality-api .
- Cache successful AQI data server-side for 30 minutes; coalesce concurrent refreshes. Treat observations older than 2 hours, malformed values, or failed upstream fetches without a fresh cached value as unavailable. The endpoint must not delay or fail `/api/states`. Client rechecks when the card mounts and every 30 minutes while mounted. Abort/cleanup on unmount.
- US AQI bands: 0–50 `God`, 51–100 `Moderat`, 101–150 `Usunn for følsomme`, 151–200 `Usunn`, 201–300 `Svært usunn`, 301–500 `Farlig`. Reject values outside 0–500. Put Open-Meteo/CAMS source attribution in the detailed weather view, visible but subdued.
- Forecast frost uses the hourly forecast minimum for the next relevant night and appears only when the minimum is below 0°C. Before local 09:00, that window is yesterday 18:00 through today 09:00; from 09:00 onward it is today 18:00 through tomorrow 09:00. An active MeteoAlarm has priority over frost. Use `sun.sun`'s next rising/setting timestamps for the daylight fallback. Every time calculation uses the dashboard's local Europe/Oslo time, including daylight-saving transitions.

## Delivery boundary

Implement locally only. Do not push, release, deploy, or update either Portainer stack as part of this card work.
