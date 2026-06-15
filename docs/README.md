# Canway Docs Status

Current status: **reliable enough at the canvas-foundation layer, not product-complete**.

Read these first:

1. `nonvisual-touch-editing-completion-report.md` - latest closure report for nonvisual node access and advanced editing, with real-device touch verification blocked/checklisted.
2. `canvas-keyboard-touch-performance-completion-report.md` - closure report for keyboard editing, two-touch gestures, and 1k/2k node performance.
3. `product-complete-remaining-dents-report.md` - product-completeness and residual-risk audit that identified the remaining dents.
4. `canway-technical-dents-audit-report.md` - latest full technical-dents audit before the product-complete pass.
5. `canvas-foundation-gap-closure-report.md` - earlier browser-probe automation, accessibility boundary, multi-touch policy, churn, and model-shape evidence.

Historical audit reports and goal prompts in this directory are useful for provenance, but they may describe issues that were later fixed or reclassified. Treat them as audit history unless a latest report explicitly references them as current evidence.

Source-owned project surface is the React/Vite frontend, canvas engine, checked-in probe runner, and docs. `dist/` is generated build output and `node_modules/` is installed dependency output; neither should be treated as authored source.

Out of scope for the current repo: ER diagrams, database schema, backend API, auth, persistence architecture, routing, collaboration, and export implementation. Those are product-layer tasks unless corresponding code is added.

Local verification gate:

```bash
npm run build
npm audit --omit=dev
npm run probe:canvas
```

`npm run probe:canvas` uses Chrome/Chromium through CDP. On machines where Chrome is not at the macOS default path, set `CANWAY_CHROME_PATH` or `CHROME_PATH` to a compatible binary.
