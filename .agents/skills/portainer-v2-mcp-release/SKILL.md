---
name: portainer-v2-mcp-release
description: Restart and verify the Home Assistant WallDash V2 release only through the connected Portainer MCP after a verified push to origin/codex/dashboard-prototype-v2. Never use the browser or Docker.
---

# Portainer V2 MCP release

Use this skill after a successful push to `origin/codex/dashboard-prototype-v2`, or whenever the V2 dashboard stack must be restarted.

1. Confirm the intended commit is reachable on `origin/codex/dashboard-prototype-v2`.
2. Through the connected Portainer MCP, call `listEnvironments` and `listLocalStacks`. Rediscover IDs immediately before mutation and select only the stack named `homeassistant-wall-dashboard-v2`.
3. Inspect the discovered V2 stack and preserve all existing environment variables. Confirm that it uses the intended branch. Never select or change the V1 stack, `homeassistant-wall-dashboard`.
4. Through the same Portainer MCP, call `stopLocalStack`, then `startLocalStack`, using the freshly discovered environment and stack IDs.
5. Verify the V2 stack is active and its replacement container is healthy through Portainer MCP. Check `http://192.168.1.50:3200/health` and `http://192.168.1.50:3200/` when an approved endpoint-check mechanism is available.

## Hard boundaries

- Do not use the Portainer browser UI.
- Do not use the local Docker daemon, Docker CLI, or direct Docker APIs.
- Do not reuse cached stack or environment IDs.
- If the connected Portainer MCP is unavailable, stop and report that deployment cannot be safely verified.
