# Canaster Docs

Current status: **usable nested canvas workspace with Daptin-backed document persistence, but with known architecture and verification debt**.

Use this file as the docs map. File paths in `docs/` are intentionally stable because older prompts and reports reference `docs/<file>.md` directly. Organize by reading order and status here before moving files.

## Read First

These files are the current contract set. They override older plans, prompts, and reports when there is a conflict.

1. `../PRODUCT.md` - product purpose, audience, language, and anti-references.
2. `../DESIGN.md` - visual system, interaction patterns, colors, typography, and UI bans.
3. `canaster-user-journeys.md` - supported product journeys written in product language.
4. `architecture-software-kt.md` - current architecture handoff for layer ownership, Daptin boundaries, persistence contracts, edit contracts, verification expectations, and known limits.
5. This `README.md` - documentation status, reading order, and source-surface map.

## Current Evidence

These documents describe current decisions or recently verified behavior. They are evidence, not replacements for the contract set above.

- `document-visibility-implementation.md` - current Private/Public visibility contract backed by Daptin `document.permission` and schema-managed actions.
- `daptin-backend-groundwork.md` - current backend setup, production notes, deployment notes, and Daptin operational evidence. Some retained sections are marked as archaeology.
- `daptin-template-rendering-gotchas.md` - routed-template behavior, share metadata, and Daptin CLI pitfalls found while implementing Canaster share metadata.
- `canaster-release-readiness-report.md` - production release-readiness evidence from 2026-06-21.
- `canaster-visual-catalog-followup.md` - preferred direction for finished visual catalog documents.
- `panel-types-ux-plan.md` - current panel vocabulary and node-type direction.
- `canvas-interaction.md` - nested embedded-canvas interaction notes. Treat as a plan unless a current architecture document confirms a behavior is shipped.

## Historical Evidence

These files are useful for provenance, but may describe old Canway paths, removed scripts, or issues that were later fixed or reclassified. Read their status banners before using them as evidence.

- `canvas-engine-reliability-audit.md`
- `canvas-engine-technical-dents-report.md`
- `canvas-foundation-dents-investigation-report.md`
- `canvas-foundation-gap-closure-report.md`
- `canvas-foundation-remaining-reliability-report.md`
- `canvas-keyboard-touch-performance-completion-report.md`
- `canway-technical-dents-audit-report.md`
- `daptin-canaster-architecture-plan.md`
- `daptin-document-persistence-progress.md`
- `nested-canvas-ux-plan.md`
- `nonvisual-touch-editing-completion-report.md`
- `product-complete-remaining-dents-report.md`

## Prompt Archive

These files are execution prompts. They are not current product, architecture, or verification contracts unless a current contract document explicitly says so.

- `audit-canvas-engine-reliability-prompt.md`
- `automate-and-close-canvas-foundation-gaps-goal-prompt.md`
- `find-all-canvas-engine-reliability-issues-prompt.md`
- `find-all-canvas-foundation-dents-goal-prompt.md`
- `find-all-remaining-technical-dents-goal-prompt.md`
- `find-product-complete-remaining-dents-goal-prompt.md`
- `find-remaining-canvas-foundation-reliability-issues-goal-prompt.md`
- `finish-recursive-infinite-nested-canvas-goal-prompt.md`
- `fix-canvas-engine-foundation-prompt.md`
- `implement-daptin-document-persistence-goal-prompt.md`
- `perfect-canvas-keyboard-touch-performance-goal-prompt.md`
- `perfect-nonvisual-touch-editing-goal-prompt.md`

## Fixtures

- `fixtures/nested-3x3-4-level-workspace.json` - nested workspace fixture data.

## What Not To Infer

- Do not treat old goal prompts as implementation sequence.
- Do not restore removed smoke scripts or probes because a historical doc mentions them.
- Do not treat `verify:fast` or `verify:static` as Daptin integration proof.
- Do not use stale Canway source paths when current docs point to `src/core`, `src/domain`, `src/app`, `src/infra`, and `src/ui`.
- Do not move public docs paths unless all references are updated in the same change.

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
