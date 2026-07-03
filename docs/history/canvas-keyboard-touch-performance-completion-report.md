# Canvas Keyboard, Touch, And Performance Completion Report

Date: 2026-06-15

## Executive Verdict

Verdict: **reliable enough**.

The three targeted canvas-foundation dents are closed at the generic interaction layer:

- canvas keyboard editing now has a truthful generic contract;
- two-touch pan and pinch are real viewport gestures instead of an ignore-only policy;
- dense 1,000-2,000 node fitted views now use low-zoom/dense level-of-detail rendering and pass a deterministic frame-window gate.

This is still not a claim that Canway is a complete product. The current repo still has no backend, persistence, routing, collaboration, export, product-specific object semantics, or full nonvisual object tree. The claim is scoped to the current canvas foundation.

## Implemented Keyboard Contract

The canvas is now intentionally keyboard reachable:

- toolbar controls remain before the canvas in sequential Tab order;
- the canvas has `tabIndex = 0`;
- the existing focus-visible ring is used for canvas focus;
- Enter or Space selects the generic node nearest the viewport center when no node is selected;
- Arrow keys move the selected node by `10` world units;
- Shift plus Arrow moves the selected node by `40` world units;
- Escape clears selection and cancels active interaction state;
- Delete and Backspace are explicit no-ops because the current model has no deletion contract;
- no-selection arrow keys do not mutate model state;
- keyboard movement emits `node-move` model changes with `source: "keyboard"`.

Evidence:

- `src/engine/CanvasEngine.ts` owns key handling and focusability.
- `src/engine/types.ts` adds model-change source metadata and interaction status.
- `src/App.tsx` displays the interaction label and model-change source.
- `npm run probe:canvas` verified:
  - canvas `tabIndex: 0`;
  - sequential focusables are Fit view, Reset zoom, Zoom out, Zoom in, Switch theme, then canvas;
  - no-selection arrow delta `0`;
  - Enter selected generic node `planner`;
  - ArrowRight plus Shift+ArrowDown moved it by `x: 10`, `y: 40`;
  - both keyboard changes were `node-move` with `source: "keyboard"`;
  - Escape cleared selection;
  - Delete/Backspace delta `0`.

## Implemented Multi-Touch Contract

Two-touch interactions now operate on the viewport only:

- one-pointer drag, resize, and pan remain intact;
- two-finger pan moves the camera without model changes;
- pinch zoom changes camera scale without model changes;
- adding a second touch during node drag rolls back the node edit and enters gesture handling;
- adding a second touch during resize rolls back the resize and enters gesture handling;
- pointer cancel ends the gesture and leaves no stuck gesture state;
- plain wheel/trackpad pan, modifier-wheel zoom, and pointer model edits still use the existing contracts.

Evidence from `npm run probe:canvas`:

- two-finger pan: `modelChangeDelta: 0`, `cameraMoved: true`, `scaleDelta: 0`;
- pinch zoom: `modelChangeDelta: 0`, `zoomedIn: true`;
- second-touch node drag: `modelChangeDelta: 0`, `rolledBack: true`;
- second-touch resize: `modelChangeDelta: 0`, `rolledBack: true`;
- canceled gesture: `modelChangeDelta: 0`, `cameraStableAfterCancel: true`;
- single touch active pointer ownership still committed exactly one `node-move`;
- pointer cancellation and lost-capture rollback stayed green for node, resize, and pan.

## Implemented Performance Contract

The old large-graph dent came from rendering full node text and shadow treatment for every visible node at very low zoom. The engine now switches to compact node rendering when either:

- camera scale is below `0.22`; or
- more than `350` nodes are visible.

The compact path still renders real node bodies, borders, selection/hover affordances, and counters. It skips expensive per-node text wrapping, clipping, and shadow work for non-selected/non-hovered nodes in dense or low-zoom views.

Target:

- 1,000 visible nodes: max frame below `100ms`;
- 2,000 visible nodes: max frame below `200ms`.

Before evidence from `docs/history/product-complete-remaining-dents-report.md`:

- 1,000 nodes: max frame around `699ms`, average `43.2ms`;
- 2,000 nodes: max frame around `1995.8ms`, average `109.7ms`.

After evidence from `npm run probe:canvas`:

- 1,000 nodes: rendered `1000/1000`, first frame `11.1ms`, max frame `11.1ms`, average `8.3ms`;
- 2,000 nodes: rendered `2000/2000`, first frame `12.4ms`, max frame `12.4ms`, average `8.3ms`.

## Required Gates

```bash
npm run build
```

Passed:

- `tsc --noEmit`
- `vite build`
- `1568 modules transformed`
- production bundle built successfully.

```bash
npm audit --omit=dev
```

Passed: `found 0 vulnerabilities`.

```bash
npm run probe:canvas
```

Passed and exited cleanly after the new keyboard, touch, and performance assertions were added.

Final probe measurements:

- 1,000 nodes: rendered `1000/1000`, first frame `8.9ms`, max frame `10.3ms`, average `8.3ms`;
- 2,000 nodes: rendered `2000/2000`, first frame `14.3ms`, max frame `14.3ms`, average `8.4ms`.

## Automation Coverage Added

`docs/canvas-foundation-devtools-probe.js` and `scripts/run-canvas-foundation-probe.mjs` now verify:

- keyboard focusability and tab order;
- no-selection keyboard no-op behavior;
- keyboard selection and movement;
- keyboard model-change source metadata;
- Delete/Backspace no-op contract;
- two-finger pan;
- pinch zoom;
- second-touch rollback for drag and resize;
- gesture cancellation cleanup;
- 1,000/2,000 node performance frame windows;
- listener cleanup including new keyboard/focus listeners.

## Live Browser Evidence

Live server:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Desktop `1280x900`, DPR `2`:

- canvas CSS `1280x900`;
- bitmap `2560x1800`;
- engine DPR `2`;
- rendered/total `4/4`;
- canvas `tabIndex: 0`;
- focus outline style `solid`;
- tab order: Fit view, Reset zoom, Zoom out, Zoom in, Switch theme, canvas;
- topbar/statusbar overlap: `false`;
- Enter selected `planner`;
- ArrowRight plus Shift+ArrowDown updated status to `node-move planner keyboard`.

Mobile/high-DPR emulation `390x844x3`:

- canvas CSS `390x844`;
- bitmap `780x1688`;
- engine DPR cap `2`;
- rendered/total `4/4`;
- topbar in viewport: `true`;
- statusbar in viewport: `true`;
- topbar/statusbar overlap: `false`;
- synthetic pinch changed zoom from `26%` to `40%`;
- status after pinch: `Touch pinch zoom`;
- model-change status stayed `No model changes`.

Large graph live visual check:

- injected an isolated `CanvasEngine` visual-check canvas;
- rendered `2000/2000` nodes;
- engine DPR `2`;
- low-zoom scale `0.1087`;
- two-frame elapsed check `8.8ms`;
- disposed the visual-check engine and removed its canvas after screenshot capture.

Screenshots:

- `/tmp/canway-desktop-keyboard-focused.png`
- `/tmp/canway-mobile-touch-pinch.png`
- `/tmp/canway-large-graph-lod.png`

Console/network:

- console contained only expected Vite debug messages and the React DevTools info message;
- network requests were expected Vite/module requests returning `200` or cache `304`;
- no unexpected failed request was observed.

## Residual Risks

- Real-device touch should still be tested before claiming mobile production readiness.
- The canvas is keyboard-operable, but the app still does not expose a full nonvisual node/object tree.
- Low-zoom level-of-detail is appropriate for dense overviews, but product-specific rendering rules may need a different threshold once real product semantics exist.
- Delete, copy/paste, multi-select, and keyboard resize remain intentionally out of contract.

## Final Scope Statement

The three named dents are closed for the current generic canvas foundation. The remaining not-product-complete areas are larger product features or accessibility architecture, not the three targeted interaction/performance defects.
