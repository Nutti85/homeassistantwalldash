# MyKid manual-login browser bootstrap

**Status:** proposed
**Date:** 2026-08-27

## Purpose

Provide a one-time, user-operated graphical browser for signing in to MyKid
without placing MyKid credentials in n8n, source code, logs, or the dashboard.
It replaces the dedicated Browserless service's DevTools-only debugger, which
cannot render a normal login window for the user.

## Design

Deploy a temporary `mykid-login-browser` service beside the existing
`mykid-browserless` service. It provides a Chromium desktop through noVNC on a
LAN-only host port and mounts the existing `mykid_browser_profile` volume at
`/data/mykid-profile`.

The login browser is deliberately not connected to the `n8n_default` network
and has no n8n, PostgreSQL, Home Assistant, or dashboard credentials. Its only
purpose is to let the user directly authenticate to `https://mykid.no/nb/logg_inn`
using the persistent browser profile.

After sign-in, the user confirms that the authenticated parent landing page is
visible. The bootstrap container is then removed, including its LAN port. The
profile volume remains mounted only by `mykid-browserless` on the private n8n
network. n8n's later Browserless requests continue to use
`--user-data-dir=/data/mykid-profile`.

## Security constraints

- The noVNC port binds only to `192.168.1.50`, never all interfaces.
- MyKid credentials, cookies, screenshots, raw HTML, and portal data are never
  copied into this repository, n8n, logs, or chat.
- The GUI service is used only during manual login and is deleted immediately
  after the authenticated-session check.
- Browserless remains token-protected and has no published port when the GUI
  session is closed.

## Read-only discovery test

Once the profile has been authenticated, configure a separate inactive n8n
workflow that calls Browserless once and ends after it returns its structured
snapshot. It has no PostgreSQL or Home Assistant nodes. Inspect only the
snapshot schema, collection names, date/time representations, and record
counts. Do not retain successful execution data or quote family content.

## Acceptance checks

1. The user can sign in through the temporary LAN noVNC page.
2. An authenticated `/foreldre` check survives a restart of
   `mykid-browserless`.
3. The noVNC service and its LAN port are removed before n8n is configured.
4. The read-only n8n workflow returns a valid snapshot shape and performs no
   writes.
