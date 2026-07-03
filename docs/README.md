# Canway Docs Status

Current status: **reliable enough at the canvas-foundation layer, not product-complete**.

Read these first:

1. `architecture-software-kt.md` - continuous-development handoff for architecture, ownership boundaries, command/edit contracts, verification, and known limits.
2. `nested-canvas-ux-plan.md` - UX plan for canvas nodes that contain child canvases, drill-in navigation, breadcrumbs, previews, keyboard/nonvisual paths, and implementation phasing.
3. `panel-types-ux-plan.md` - concise UX plan for current and next panel types; recommends checklist before embed.
4. `canaster-visual-catalog-followup.md` - follow-up catalog direction for highly visual starter documents such as brackets, lore maps, rankings, timelines, and atlases.
5. `nonvisual-touch-editing-completion-report.md` - latest closure report for nonvisual node access, advanced editing, pointer group-drag, render-only pointer preview, and real-device touch verification blocked/checklisted.
6. `canvas-keyboard-touch-performance-completion-report.md` - closure report for keyboard editing, two-touch gestures, and 1k/2k node performance.
7. `product-complete-remaining-dents-report.md` - product-completeness and residual-risk audit that identified the remaining dents.
8. `canway-technical-dents-audit-report.md` - latest full technical-dents audit before the product-complete pass.
9. `canvas-foundation-gap-closure-report.md` - earlier browser-probe automation, accessibility boundary, multi-touch policy, churn, and model-shape evidence.
10. `document-visibility-implementation.md` - current private/public document visibility contract backed by Daptin `document.permission`, with group sharing explicitly deferred.

Historical audit reports and goal prompts in this directory are useful for provenance, but they may describe issues that were later fixed or reclassified. Treat them as audit history unless a latest report explicitly references them as current evidence.

Source-owned project surface is the React/Vite frontend, canvas engine, native nested-canvas runtime, Daptin adapter boundary, fixture/profile tooling, and docs. `dist/` is generated build output and `node_modules/` is installed dependency output; neither should be treated as authored source.

Out of scope for the current repo: custom Canaster backend services, ER diagrams for new app-owned tables, collaboration, and normalized persistence models. Daptin-backed auth, document persistence, asset storage, routing, and visibility are in scope only through the existing Daptin boundary.

Local verification gate:

```bash
npm run build
npm audit --omit=dev
npm run fixture:nested
```

`npm run profile:nested` uses Chrome/Chromium through CDP against a running dev server, defaulting to `http://127.0.0.1:5175/`. On machines where Chrome is not at the macOS default path, set `CANWAY_CHROME_PATH` or `CHROME_PATH` to a compatible binary.
