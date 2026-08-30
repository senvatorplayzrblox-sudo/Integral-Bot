---
name: Workspace build environment
description: Build-time environment behavior for the multi-artifact workspace.
---

For workspace-wide builds, provide required artifact-specific values such as `PORT` and `BASE_PATH` in the command environment instead of changing `.replit` or project configuration.

**Why:** Managed preview artifacts can require these values during Vite builds, while invoking extra language tooling may persist unrelated module changes in `.replit`.

**How to apply:** Keep `.replit` limited to the project’s declared runtime modules and use temporary command-scoped environment values for verification.