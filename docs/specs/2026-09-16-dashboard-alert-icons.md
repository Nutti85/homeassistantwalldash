# Compact dashboard alert icons

## Problem

Variant C uses a full-width urgent strip that takes visual priority from the
dashboard. Active operational alerts need to stay visible without moving the
clock, date, or dashboard lanes.

## Intended behavior

The `AKKURAT NÅ` heading has a right-aligned `Aktive varsler` group containing
one compact circular icon button for each active non-door alert. Sources are
MET weather warnings, nearby lightning, forecast wind gusts, aurora visibility,
and stopped charging in the warning prototype scenario. An unlocked door is
never an alert because the existing `Lås døren` control owns that state.

MET alerts use event-specific icons from `meteoEventMeta`; event data remains
filtering-aware through `meteoAlarmEntries`. Selecting an icon opens the
existing V2 modal style. MET details include all parsed warning information;
the other alerts state their current source and context.

## Scope and constraints

- Do not reflow the global date/time header or change the V2 dashboard lanes.
- Controls are 36–40px circles with accessible names and titles.
- Modal close works through its close button, backdrop click, Escape, and
  restores focus to the icon that opened it.
- Keep the existing prototype warning scenario as a deterministic source for
  its applicable alerts.

## Acceptance criteria

- No `.ppf-urgent` strip is rendered by Variant C.
- Alert model has unit coverage for all supported alert types and excludes doors.
- A MET icon opens a detailed modal by keyboard and restores focus on Escape.
- Existing full test suite, TypeScript build, and whitespace diff check pass.
