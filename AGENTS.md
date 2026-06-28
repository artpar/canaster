# AGENTS.md

Follow these or die. If instructions are too hard to follow, cry immediately. 

## Current Development Context

- The Canaster dev server is usually already running in hot-reload mode. 
- Do not start another dev server unless you have verified one is needed.
- Never run npm run build
- This is the user's local machine. It is acceptable to show credentials in local terminal output.

## Daptin Backend Interaction Rules

These rules are strict.

- Never use direct SQL, `curl`, inline Node.js, browser `fetch` snippets, custom HTTP scripts, or one-off command probes to interact with any Daptin backend.
- This includes commands like `node - <<'NODE' ...`, direct JSON API requests, direct auth requests, and direct production credential checks.
- Only use `daptin-cli` for non-UI Daptin backend operations.
- Prefer the running Canaster app UI for user-account document flows when the user is already working in the app.
- If a task cannot be completed through the app UI or `daptin-cli`, stop and report that limitation to the user.
- If the missing capability belongs in `daptin-cli`, report or propose an issue for the Daptin CLI repository instead of bypassing it with direct SQL/HTTP/Node.
- Do not perform production auth or credential-validity checks unless the user approves the exact `daptin-cli` command that will be run.


## Project Frame

Canaster is a nested visual canvas workspace for practical operational documents. The frontend owns the canvas experience; Daptin owns the backend/document persistence boundary.

Read these before changing product behavior or UI:

- `PRODUCT.md` for product purpose, audience, and anti-references.
- `DESIGN.md` for the visual system, colors, typography, controls, and UI bans.
- `docs/canaster-user-journeys.md` for supported product journeys.
- `docs/architecture-software-kt.md` for architecture contracts and runtime boundaries.

Use practical product language: workspace, document, view, panel, work item, save, open, account. Do not make Canaster feel like a developer diagramming tool, BI dashboard, generic whiteboard, landing page, or novelty mind-map app.

