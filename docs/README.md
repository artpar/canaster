# Canaster Docs Status

Current status: **usable nested canvas workspace with Daptin-backed document persistence, but with known architecture and verification debt**.

Current contract set:

1. `../PRODUCT.md` - product purpose, audience, language, and anti-references.
2. `../DESIGN.md` - visual system, interaction patterns, colors, typography, and UI bans.
3. `architecture-software-kt.md` - current architecture handoff for layer ownership, Daptin boundaries, persistence contracts, edit contracts, verification expectations, and known limits.
4. `canaster-user-journeys.md` - supported product journeys written in product language.
5. This `README.md` - documentation status and source-surface map.

Current supporting evidence:

- `document-visibility-implementation.md` - current Private/Public visibility contract backed by Daptin `document.permission` and schema-managed actions.
- `deep-architecture-technical-debt-review-2026-07-03.md` - latest sourced architecture and technical-debt review. It is audit evidence, not a replacement for the contract set above.

Historical plans, progress reports, audit reports, completion reports, and goal prompts in this directory are useful for provenance, but they may describe old Canway source paths, missing scripts, or issues that were later fixed or reclassified. Treat them as history unless a current contract document explicitly references them as live evidence. Files with historical banners must not be followed for current paths or implementation sequence.

## Current Source Surface

Authored source is organized as:

- `src/core/` - pure utilities, types, and primitives.
- `src/domain/` - pure workspace/document model, commands, semantics, and history. This layer must not import `src/infra`.
- `src/app/` - starter workspace and app-level protocol/orchestration code.
- `src/infra/` - Daptin adapters, browser storage, local assets, and URL state.
- `src/ui/` - React components, canvas runtime, nested workspace runtime, node rendering/editors, and themes.

Backend and deployment material is under:

- `daptin/`
- `deploy/daptin/`
- `docker-compose.daptin.yml`

Local Daptin development uses the persistent Compose instance from `docker-compose.daptin.yml`, not per-run scratch Daptin containers. `npm run daptin:up` prepares generated local schema under `.tmp/daptin/local-schema`, starts Postgres and Daptin with named volumes, and keeps local account/document/asset/mail state across normal stops. The local app target is `npm run dev:local`, using `canaster.local` for the app/backend hostname.

Generated or installed output:

- `dist/`
- `node_modules/`

Do not treat generated output as authored source.

## Current Product Boundary

Canaster is a nested visual canvas workspace. The frontend owns the canvas experience. Daptin owns the backend/document persistence boundary.

In scope for this repo:

- local draft persistence;
- Daptin account/session UI integration;
- Daptin-backed saved documents;
- Daptin-backed assets;
- document visibility through schema-managed Daptin actions;
- live transport integration through the existing Daptin boundary;
- canvas, nested views, panels, work items, save/open/account journeys.

Out of scope unless a current architecture decision says otherwise:

- custom Canaster backend services;
- new app-owned workspace tables;
- ER diagrams for invented persistence models;
- generic collaboration models outside the current Daptin live boundary;
- group sharing UI and generated Daptin join-table manipulation.

## Local Verification

Rapid local check for day-to-day Canaster development:

```bash
npm run verify:fast
```

This runs TypeScript and whitespace/conflict-marker checks only. It avoids Daptin, network audit, browser automation, and build output so it is suitable for the hot-reload development loop.

Full rule-compliant static checks:

```bash
npm run verify:static
```

Do not run `npm run build` in the current local agent workflow. The active repository instructions forbid it.

Do not rely on old missing gates such as:

- `npm run fixture:nested`
- `npm run profile:nested`

Some older Daptin scripts use direct HTTP or `curl`. Current backend operation rules require using the running app UI for user-account document flows or `daptin-cli` for non-UI Daptin backend operations.

There is currently no supported automated Daptin integration gate in this repo. Do not treat `verify:fast` or `verify:static` as proof of Daptin integration, live transport, asset upload/download, or production auth behavior.
