---
name: portainer-v2-release
description: Deploy a verified Home Assistant WallDash V2 release after pushing to GitHub. Use after a successful push to origin/codex/dashboard-prototype-v2 or when restarting the V2 dashboard container; never use for V1.
---

## Purpose

Safely make a verified V2 GitHub release live and prove that the running dashboard received it.

## Required workflow

1. Confirm the pushed commit is reachable from `origin/codex/dashboard-prototype-v2`. Do not deploy another branch, a local-only commit, or an unverified working tree.
2. Re-discover the Portainer environment and the stack named exactly `homeassistant-wall-dashboard-v2`. Never reuse cached IDs.
3. Inspect the discovered stack before mutating it:
   - its Git source must point to `origin` and `codex/dashboard-prototype-v2`;
   - preserve every existing environment variable, especially Home Assistant and Frigate credentials;
   - verify it is not the V1 stack, `homeassistant-wall-dashboard`.
4. Stop and start only the discovered V2 stack. Do not use local Docker or restart individual V1 containers.
5. Wait until the V2 container is running and healthy. Then verify all of:
   - `http://192.168.1.50:3200/health` returns HTTP 200;
   - `http://192.168.1.50:3200/` returns HTTP 200;
   - `http://192.168.1.50:3200/api/activity` returns HTTP 200.
6. If the release changes Frigate activity behavior, inspect the safe activity response and confirm it reflects the release contract. Do not expose URLs, tokens, credentials, or full Home Assistant payloads in output.

## Boundaries and recovery

- A successful Git push alone is not evidence of deployment; report completion only after the running V2 checks pass.
- If the Portainer connector/session is unavailable, stop before any restart and report the access blocker. Do not substitute guessed stack IDs, direct Docker commands, or an unauthenticated browser flow.
- If the stack, branch, health check, or API check is wrong, stop and investigate before another restart. Leave V1 untouched.
