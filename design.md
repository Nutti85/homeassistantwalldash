# Dashboard design

## Card content inset

All dashboard card containers use the same inset between their content and outer edge as the **Akkurat nå** weather card.

- Standard layout: `13px 14px` (vertical, then horizontal).
- Narrow layout (`max-width: 700px`): `12px` on every side, matching the weather card's responsive inset.

This applies to `.ppf-surface`, `.ppf-weather-j`, `.ppf-weather-v1`, `.ppf-nudges button`, and `.ppf-camera-pair .doorbell-card` in `src/client/styles.css`. Keep the shared inset on the card root; spacing inside controls, lists, and nested tiles remains specific to their content.

## Modal shell

All dashboard dialogs use the climate modal's outer shell pattern from `DashboardModalShell`: center the dialog over a dimmed backdrop and place one 42px close button 10px above the dialog's top-right edge. Use the shared 16px radius, mint-tinted border, dashboard surface, and standard modal shadow for the outer panel. Keep the dialog's content, action buttons, and internal layout inside the panel. Put only the close control in the shell; preserve its label, focus ref, and close behavior when moving it out of a dialog header.

Use the shared `DashboardModalShell` component for new dialogs and when updating existing ones. The shell owns the accessible dialog role and close control; its child remains the styled content panel. Keep enough vertical space for the floating close button when setting a dialog's maximum height.

## Compact selectors

Compact filters such as the period and task-category selectors use the same visual treatment as `.ppf-future-horizon`: no outer container, a `3px` gap, and buttons with a `32px` minimum height, `4px 8px` padding, an `8px` radius, and `9px` semibold text. Selected options use the warm border and background; unselected options use muted text. Keep a visible keyboard-focus outline. At `max-width: 370px`, preserve a `48px` minimum button height for touch targets.
