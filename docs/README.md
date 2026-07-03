# Canaster Docs Status

Current status: **usable nested canvas workspace with Daptin-backed document persistence, but with known architecture and verification debt**.

Read these first:

1. `architecture-software-kt.md` - current architecture handoff for layer ownership, Daptin boundaries, persistence contracts, edit contracts, verification expectations, and known limits.
2. `canaster-user-journeys.md` - supported product journeys written in product language.
3. `document-visibility-implementation.md` - current Private/Public visibility contract backed by Daptin `document.permission` and schema-managed actions.
4. `nested-canvas-ux-plan.md` - UX plan for canvas nodes that contain child canvases, drill-in navigation, breadcrumbs, previews, keyboard/nonvisual paths, and implementation phasing.
5. `panel-types-ux-plan.md` - concise UX plan for current and next panel types; recommends checklist before embed.
6. `canaster-visual-catalog-followup.md` - follow-up catalog direction for highly visual starter documents such as brackets, lore maps, rankings, timelines, and atlases.
7. `deep-architecture-technical-debt-review-2026-07-03.md` - latest sourced architecture and technical-debt review.

Historical audit reports, completion reports, and goal prompts in this directory are useful for provenance, but they may describe old Canway source paths, missing scripts, or issues that were later fixed or reclassified. Treat them as audit history unless a current document explicitly references them as live evidence.

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

Current rule-compliant local static checks:

```bash
npm exec tsc -- --noEmit
npm audit --omit=dev
git diff --check
```

Do not run `npm run build` in the current local agent workflow. The active repository instructions forbid it.

Do not rely on old missing gates such as:

- `npm run fixture:nested`
- `npm run profile:nested`

Some older Daptin scripts use direct HTTP or `curl`. Current backend operation rules require using the running app UI for user-account document flows or `daptin-cli` for non-UI Daptin backend operations.
