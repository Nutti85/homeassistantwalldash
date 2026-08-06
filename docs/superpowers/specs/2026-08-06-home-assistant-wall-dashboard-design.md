# Home Assistant Wall Dashboard Design

## Status

Approved by the user on 2026-08-06. This specification is the design contract for implementation.

## Design source

- **Google Stitch project:** `9265390337450298372`
- **Screen:** `SmartHjem Dashboard (Uten Sidebar)` (`9179f9ae09c74d7e8af31ac53534ef4e`)
- **Target stack:** React client and Node.js server, packaged as one Docker service.
- **Scope:** One responsive, Norwegian, browser-based dashboard for a Huawei MatePad T in landscape orientation.

## User experience and information architecture

The product has one full-screen dashboard without a sidebar or routing. The page uses the Stitch 12-column fixed-grid hierarchy in landscape: a 32 px page margin, 24 px gutters, 24 px card padding, 16 px card radius, and 56 px minimum interactive targets. The grid is responsive: it maintains the supplied card order at the tablet size and reflows safely to fewer columns on smaller viewports.

The first row, from left to right, contains these control cards:

1. `Hjemme` / `Borte` for `input_select.home_state`.
2. `Gjestemodus` for `input_boolean.toggle`.
3. `Morgenmodus` for `automation.modus_god_morgen`.
4. `Kveldsmodus` for `script.1572988362234`.
5. `Nattamodus` for `script.1569099501074`.

The next row contains the cooling card for `automation.klima_automatisk_kjoling_optimalisert` and `climate.daikinap19531_room_temperature`. It displays cooling automation state, the climate target temperature, and large `−` and `+` controls. A red `Reparer smarthuset` action is fixed to the dashboard's lower-right grid position. It opens an accessible modal that embeds `http://192.168.1.127:8080/` in an iframe and can be dismissed with a visible close action.

All copy, controls, errors, and status labels are Norwegian.

## Stitch design contract

React implementation maps Stitch tokens to CSS custom properties. The following invariants are mandatory:

- Dark Nocturne Control surfaces: `#051424` background; elevated cards use the specified slate surface tiers with a subtle light inner border.
- Inter typography with the Stitch hierarchy: 48/56 headline, 32/40 section title, 24/32 card title, 20/28 body, and 16/20 labels. Large temperature values use 64/72 bold display typography.
- Semantic accents: warm amber for morning, cool blue for cooling, soft purple for night, and red exclusively for the repair action/error indication.
- Card anatomy is retained: a large thick-stroke icon at top left, status at top right, title at bottom left, and a tinted active-state glow.
- Controls depress by 2 px while pressed. Oversized toggles and temperature steppers remain clearly actionable.
- Loading, unavailable, and failed states use the same card hierarchy and do not change navigation, grouping, primary-action placement, or visual hierarchy.

## Home Assistant integration

The browser never receives Home Assistant credentials. It requests only same-origin Node endpoints under `/api`. The server reads `HA_URL` and `HA_TOKEN` from Portainer-injected secrets and communicates with the Home Assistant REST API.

At initial load and after every action, the service reads the relevant entity states. The UI must render the actual returned state and must not claim success from an optimistic local update.

| Dashboard action | Home Assistant command | Confirmation read |
| --- | --- | --- |
| Hjemme/Borte | `input_select.select_option` for `input_select.home_state` with the selected option | `GET /api/states/input_select.home_state` |
| Gjestemodus | `input_boolean.turn_on` for `input_boolean.toggle` | `GET /api/states/input_boolean.toggle` |
| Morgenmodus | `automation.trigger` for `automation.modus_god_morgen` | `GET /api/states/automation.modus_god_morgen` |
| Kveldsmodus | `script.turn_on` for `script.1572988362234` | `GET /api/states/script.1572988362234` |
| Nattamodus | `script.turn_on` for `script.1569099501074` | `GET /api/states/script.1569099501074` |
| Kjøl huset | `automation.turn_on` for `automation.klima_automatisk_kjoling_optimalisert` | `GET /api/states/automation.klima_automatisk_kjoling_optimalisert` |
| Temperatur | `climate.set_temperature` for `climate.daikinap19531_room_temperature` | `GET /api/states/climate.daikinap19531_room_temperature` |

The server validates entity IDs, accepts no arbitrary service calls from the browser, and clamps requested temperatures to the climate entity's returned `min_temp` and `max_temp` attributes. It logs actionable server-side context but never logs `HA_TOKEN` or returns Home Assistant authorization details to the client.

## State, errors, and accessibility

Each action disables only its own affected control while it is in flight. The server issues the command, then retrieves the entity state. A failed command, failure to read confirmation state, or contradictory returned state appears as a Norwegian inline card error. The client exposes state changes to assistive technology and preserves 56 px touch targets, strong contrast, keyboard focus, visible labels, and modal focus management.

## Deployment contract

The application is one Docker Compose service with a health endpoint. It requires `HA_URL` and `HA_TOKEN` as Portainer stack secrets/environment variables. No database, persisted data, or host-path mount is required. An image rebuild and explicit Portainer stack update deploys a release. Deployment needs the target Portainer environment and stack name before infrastructure can be changed.

## Verification contract

Automated tests must cover Home Assistant endpoint mapping, input validation, temperature boundary behavior, command-then-read confirmation, actual-state UI rendering, Norwegian errors, and client modal/controls. The production build must pass, and manual tablet verification must cover responsive card order, touch targets, every requested control, repair iframe modal, unavailable Home Assistant behavior, and state refresh after each action.

## Anti-drift validation

- [x] Screen inventory and single-screen navigation model match Stitch scope.
- [x] Token map preserves dark colors, Inter hierarchy, spacing, density, and 16 px card geometry.
- [x] Card, toggle, stepper, and repair-action semantics preserve Stitch component intent and CTA emphasis.
- [x] Loading and error feedback preserves the Stitch interaction hierarchy.
- [x] Touch target, contrast, and scannability constraints are explicit.
