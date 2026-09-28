# Dashboard design

## Card content inset

All dashboard card containers use the same inset between their content and outer edge as the **Akkurat nå** weather card.

- Standard layout: `13px 14px` (vertical, then horizontal).
- Narrow layout (`max-width: 700px`): `12px` on every side, matching the weather card's responsive inset.

This applies to `.ppf-surface`, `.ppf-weather-j`, `.ppf-weather-v1`, `.ppf-nudges button`, and `.ppf-camera-pair .doorbell-card` in `src/client/styles.css`. Keep the shared inset on the card root; spacing inside controls, lists, and nested tiles remains specific to their content.
