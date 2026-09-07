# Wall dashboard V2 staging

## Goal

Ship the approved time-zone dashboard direction as a separately deployable V2 while keeping the current `homeassistant-wall-dashboard` (V1) stack unchanged.

## Scope

- The V2 build renders the selected V2 dashboard at `/` without requiring a query parameter.
- Existing query-driven preview scenarios remain available only when explicitly requested, so camera, doorbell and warning states can still be demonstrated.
- A dedicated Portainer Compose file declares a separate service, container and persistent code volume.
- On every container start, V2 fetches the configured GitHub branch, resets its local clone to that branch, installs dependencies, builds, and starts.
- V2 uses its own external host port; V1 retains port `3100` and its existing stack/environment untouched.

## Non-goals

- Replacing the real Frigate-event pipeline or Home Assistant entity mappings in this release.
- Modifying V1 code, its Portainer stack, its volume, or its host port.
- Assigning a fixed Docker-internal IP. The stable tablet address is the existing host IP plus V2's distinct port.

## Acceptance criteria

- `npm.cmd run build` and `npm.cmd test` pass from the V2 branch.
- GitHub contains the V2 branch used by the new stack.
- Portainer has an active `homeassistant-wall-dashboard-v2` stack alongside V1.
- V2's `/health` endpoint is healthy and its browser root presents the V2 dashboard.
- Restarting the V2 container pulls the configured V2 GitHub branch before rebuilding.
