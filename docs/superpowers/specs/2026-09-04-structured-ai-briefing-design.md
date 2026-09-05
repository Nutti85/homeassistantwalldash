# Structured Klara AI briefing design

**Status:** Approved direction, ready for implementation planning

## Goal

Make every Klara AI report understandable at a glance without changing the established Klara visual identity. The report period must be immediately visible, numeric weather values must use consistent rounding, and calendar and other practical information must remain in predictable positions.

## Scope

This design applies to all five report modes already supported by WallDash:

- `full` — next 24 hours from publication
- `morning` — 06:00–09:00
- `midday` — 09:00–15:00
- `afternoon` — 16:00–19:00
- `evening` — 19:00–23:00

The deliberate 15:00–16:00 gap remains unchanged. Report schedules, refresh behavior, n8n workflows, and Home Assistant entity configuration are outside this change.

## Visual structure

Keep the current Klara AI shell unchanged: blurred dashboard backdrop, centered dark green-charcoal modal, rounded border, peach sparkle badge, `KLARA AI` eyebrow, close button, mint status dot, and the existing five report selectors in the footer.

Inside that shell, replace the prose-first body with three stable layers:

1. A period banner with one unambiguous label such as `I kveld · 19:00–23:00` or `Neste 24 timer · fre. 22:00–lør. 22:00`.
2. A five-card weather strip in the fixed order `Vær`, `Temperatur`, `Vind`, `Regn`, `Klær`.
3. A fixed two-by-three practical grid:
   - row 1: `Kalender`, `Reise`, `Skole`
   - row 2: `Barnehage`, `Hjemmet`, `Varsler`

The original AI report remains available under a collapsed `Vis detaljer` disclosure below the practical grid. This preserves every topic the generated report contains without making the default view dense.

The compact Klara card on the dashboard uses the same period and metric model, but shows only the period plus the five compact weather/clothing metrics. Opening Klara AI reveals the full practical grid and detailed prose.

## Data semantics

The structured cards are calculated from the Home Assistant state snapshot already loaded by the dashboard. They do not parse numbers out of AI prose.

Every value must state what it represents:

- `nå` for a current sensor reading
- `lavest–høyest i perioden` for a range
- `maks i perioden` for wind or gust maxima
- `sum i perioden` and `høyeste sannsynlighet` for rain
- `prognose` when the value comes from hourly forecast points

Focused reports select hourly forecast points in their named Oslo-time interval. A full report selects the 24 hours beginning at `publishedAt`. If the requested interval partly lies outside the available forecast, the UI uses the available points and says `Delvis prognose`. If no suitable points exist, the affected card says `Ikke tilgjengelig`; it must never invent or extract a value from prose.

Current Netatmo readings are used only when the report interval contains the current time. Future intervals use forecast values. This prevents a future morning report from presenting tonight's wind as tomorrow morning's wind.

## Rounding and formatting

- Temperature: nearest 0.5 °C, displayed with Norwegian decimal comma (`12,5 °C`).
- Wind and gust: nearest whole m/s (`4 m/s`).
- Rain amount: nearest 0.1 mm, except exact zero is `0 mm`.
- Probability: nearest whole percent.
- Missing data: `Ikke tilgjengelig`, never an unexplained dash.

## Weather and clothing cards

Each metric card contains a small label, one large Material Symbol icon, one prominent value, and one short context line. The icon is decorative when the visible label and value already communicate the meaning.

Clothing is deterministic advice derived from the selected period, not a free-form AI sentence:

- below 5 °C: warm outerwear
- 5–11.5 °C: jacket and layers
- 12–17.5 °C: light jacket or sweater
- 18 °C and above: light clothing
- at least 40% rain probability or at least 0.2 mm: add rainwear/umbrella
- gusts of at least 10 m/s: add windproof layer

The card shows one clothing icon and a short primary recommendation; additions appear in the context line.

## Practical cards

All six cards always render in the same DOM and visual order. Empty data does not collapse or reorder the grid.

- `Kalender`: events overlapping the report period, or the next event when the period has none. Show at most two items, with date/time context.
- `Reise`: Andreas and Hege travel times when available. Each missing person is explicitly marked unavailable.
- `Skole`: the schedule, event, reminder, or homework relevant to the period/date. Otherwise `Ingen skole denne perioden` or `Ikke tilgjengelig` when the source itself is absent.
- `Barnehage`: relevant MyKid `today`, event, birthday, or weekly-plan item. Otherwise `Ingen plan denne perioden` or `Ikke tilgjengelig`.
- `Hjemmet`: front-door lock and security mode first; a third short actionable household status may be added only when space permits.
- `Varsler`: active or period-overlapping meteo alerts, nearby lightning, forecast gust warning, and aurora visibility. Expired alerts are excluded by their end timestamp.

## Accessibility and responsive behavior

- Keep the modal's existing dialog semantics, focus behavior, Escape handling, and close-button focus return.
- The period banner is text, not color-only communication.
- Metric values and context are exposed as normal text; decorative icons use `aria-hidden`.
- `Vis detaljer` uses native disclosure semantics or an equivalent button with `aria-expanded` and `aria-controls`.
- On narrow displays, the five metrics become a horizontally scrollable strip or a two-column grid without changing order. The practical grid becomes one column, also without changing order.
- The modal footer remains reachable and does not cover report content.

## Acceptance criteria

1. The active report period is understandable without reading prose.
2. Temperature and wind follow the agreed rounding rules in every report mode.
3. The five metrics and six practical categories keep the exact same order in all states.
4. Clothing has a recognizable icon and deterministic weather-based recommendation.
5. Current and forecast values are clearly distinguished.
6. Expired warnings do not appear as active warnings.
7. Missing sources show meaningful empty states and do not move neighboring cards.
8. Existing report selectors, refresh progress, loading/error states, modal behavior, and Klara styling remain intact.
9. The complete original AI report remains available through `Vis detaljer`.

## Non-goals

- Building a report archive or adding historical sensor storage
- Changing n8n prompts or schedules
- Adding a new report mode
- Redesigning non-Klara dashboard cards
- Deploying to Portainer as part of the implementation itself
