# Canway Docs Status

Current status: **reliable enough at the canvas-foundation layer, not product-complete**.

Read these first:

1. `architecture-software-kt.md` - continuous-development handoff for architecture, ownership boundaries, command/edit contracts, verification, and known limits.
2. `nested-canvas-ux-plan.md` - UX plan for canvas nodes that contain child canvases, drill-in navigation, breadcrumbs, previews, keyboard/nonvisual paths, and implementation phasing.
3. `node-plugin-contract-plan.md` - concrete technical implementation plan for pluggable node types such as card, text, image, canvas, and future plugin-defined nodes.
4. `panel-types-ux-plan.md` - concise UX plan for current and next panel types; recommends checklist before embed.
5. `nonvisual-touch-editing-completion-report.md` - latest closure report for nonvisual node access, advanced editing, pointer group-drag, render-only pointer preview, and real-device touch verification blocked/checklisted.
6. `canvas-keyboard-touch-performance-completion-report.md` - closure report for keyboard editing, two-touch gestures, and 1k/2k node performance.
7. `product-complete-remaining-dents-report.md` - product-completeness and residual-risk audit that identified the remaining dents.
8. `canway-technical-dents-audit-report.md` - latest full technical-dents audit before the product-complete pass.
9. `canvas-foundation-gap-closure-report.md` - earlier browser-probe automation, accessibility boundary, multi-touch policy, churn, and model-shape evidence.

Historical audit reports and goal prompts in this directory are useful for provenance, but they may describe issues that were later fixed or reclassified. Treat them as audit history unless a latest report explicitly references them as current evidence.

Source-owned project surface is the React/Vite frontend, canvas engine, native nested-canvas runtime, fixture/profile tooling, and docs. `dist/` is generated build output and `node_modules/` is installed dependency output; neither should be treated as authored source.

Out of scope for the current repo: ER diagrams, database schema, backend API, auth, persistence architecture, routing, collaboration, and export implementation. Those are product-layer tasks unless corresponding code is added.

Local verification gate:

```bash
npm run build
npm audit --omit=dev
npm run fixture:nested
```

`npm run profile:nested` uses Chrome/Chromium through CDP against a running dev server, defaulting to `http://127.0.0.1:5175/`. On machines where Chrome is not at the macOS default path, set `CANWAY_CHROME_PATH` or `CHROME_PATH` to a compatible binary.
