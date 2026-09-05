# Home Assistant Wall Dashboard

Read and follow `AGENTS.md` for the complete repository instructions, including local development, Home Assistant, and Portainer operations.

## Engineering workflow

- Use the globally installed `engineering-router` skill as the workflow authority for software-development work unless an explicit project instruction overrides it.
- Classify each request as `QUICK`, `FEATURE`, `BUG`, `ARCHITECTURE`, or `SPIKE`, and use the lightest workflow that preserves correctness.
- Preserve the repository's existing conventions and follow `AGENTS.md` before generic skills.
- Do not independently activate Superpowers `using-superpowers` or `brainstorming`, or Matt Pocock `tdd`, `diagnosing-bugs`, `code-review`, or `implement`, as top-level workflow controllers unless explicitly requested.
- For UI/UX work, read the repository's `design.md` or other design guidance first and preserve existing patterns.
