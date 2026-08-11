# Project operations

- Use the connected Portainer MCP for stack, container, and deployment operations in this project.
- Do not assume the local Docker daemon controls the deployed dashboard.
- Re-discover the Portainer environment and stack IDs before mutating them; target the stack named `homeassistant-wall-dashboard`.
- Preserve existing Portainer environment variables, especially Home Assistant credentials, during stack updates.
