# Canvas Foundation Gap Closure Report

Date: 2026-06-14

## Executive Verdict

Verdict: **reliable enough**.

This should not be called perfect. The generic canvas foundation now has an automated browser probe, an explicit keyboard contract, an explicit multi-touch policy, stronger cancellation/churn/model-shape coverage, clean build/audit results, and clean runtime console/network inspection. The remaining non-perfect gap is intentional: the current canvas content has no product-specific nonvisual node/object model. Adding one without real product semantics would invent behavior that this foundation does not own.

## Changes Made

- Fixed the keyboard contract mismatch by removing the canvas from sequential tab order while keeping pointer/programmatic focus working: `src/engine/CanvasEngine.ts:88`.
- Added `npm run probe:canvas`: `package.json:10`.
- Added a lightweight CDP/Chrome probe runner that starts Vite, launches headless Chrome, runs the checked-in probe, asserts results, inspects console/network events, and tears down processes: `scripts/run-canvas-foundation-probe.mjs:1`.
- Extended the checked-in browser probe to cover app/tab/a11y surface, keyboard keys, cancellation/lost-capture rollback, multi-touch policy, 60-cycle churn, future model-shape stress, and lifecycle balance: `docs/canvas-foundation-devtools-probe.js:94`.

## Probe Automation

Automation decision: use local Chrome DevTools Protocol instead of Playwright. The repo already has Node 22 with global `WebSocket`, Vite, and Chrome installed at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, so no new dependency was needed.

Command:

```bash
npm run probe:canvas
```

Result: passed.

Key output from the final run:

- app canvas: CSS `756x469`, bitmap `756x469`, DPR `1`, rendered `4/4`.
- sequential focusables: `Fit view`, `Reset zoom`, `Zoom out`, `Zoom in`, `Switch to light theme`; no canvas.
- model boundary deltas: hover `0`, selection `0`, zero-delta drag `0`, real drag `1`, zero-delta resize `0`, real resize `1`, wheel `0`, double-click `0`, theme `0`, canvas resize `0`.
- cancellation/lost capture: node drag, resize, and pan all `modelChangeDelta: 0` and `rolledBack: true`.
- multi-touch: unrelated second touch pointer ignored; active node drag commits one `node-move`; active resize commits one `node-resize`; active pan emits no model changes and camera moves only after the active pointer moves.
- churn: 60 cycles, `modelCallbackCount: 120`, expected `120`, listeners balanced to `0`, heap used decreased from `9574104` to `8085538`.
- future model shape: 1,000 nodes, 2,000 nodes, dense overlap, extreme coordinates, min-size nodes, very wide/tall nodes, long text, mixed near/far, and unusual valid ids/labels all had coherent culling, zero model callbacks, and no errors.
- lifecycle: listener counts balanced to `0`; changes after dispose `0`.
- browser events: only Vite debug connection messages and the standard React DevTools development info message.

## Fixed Issues

### Medium: Canvas Was In Tab Order Without Keyboard Operations

Reproduction:

- Before this pass, `CanvasEngine` forced `canvas.tabIndex = 0`.
- The canvas could be reached by normal Tab navigation even though arrows, `+`, `-`, `Enter`, `Escape`, and `Space` had no defined canvas behavior.

Fix:

- Changed the engine to `canvas.tabIndex = -1` so pointer interaction can still focus the canvas, but toolbar buttons remain the only sequential keyboard controls.

Verification:

- `npm run probe:canvas` asserted `app.tabIndex === -1`, no canvas in `sequentialFocusables`, programmatic canvas focus works, and tested keys emit zero model changes.
- Live DevTools check on `npm run dev` showed `focusables` contained only the five toolbar buttons, `canvasTabIndex: -1`, `afterProgrammaticFocus: true`, and keyboard events left status/counters unchanged.
- Pressing Tab in the browser moved focus to `Fit view`, then `Reset zoom`.

## Confirmed Issues Not Fixed

### Medium: No Nonvisual Node Representation

Evidence:

- Accessibility snapshot exposes `Canvas "Canway canvas"`, the five toolbar buttons, and `status atomic live="polite"`.
- It does not expose individual node labels or selection as structured nonvisual objects.

Impact:

- This is acceptable for the current generic foundation only if the canvas content remains visual-only until the product layer defines object semantics.
- It is not acceptable for a finished product surface that expects screen-reader users to inspect or manipulate nodes.

Recommended next task:

- When the product object model exists, add a derived nonvisual representation from the real model: object list, selection state, and keyboard operations that match product semantics. Do not add fake hidden node semantics in this foundation pass.

## Keyboard Contract

Policy:

- Canvas is not in sequential tab order.
- Canvas remains programmatically focusable after pointer interaction.
- Toolbar buttons are the only keyboard-operable controls for now.
- Arrow keys, `+`, `-`, `Enter`, `Escape`, and `Space` have no canvas behavior until product-specific object semantics define selection movement, resizing, or activation.
- No `aria-keyshortcuts` are advertised because no canvas shortcuts exist.

Evidence:

- Automated probe: `tabIndex: -1`, `programmaticFocusWorks: true`, `keyModelChangeDelta: 0`.
- Browser evidence: focusables were the five toolbar buttons only; status stayed `No selection / Drawn 4/4 / No model changes` after key dispatch.

## Accessibility Surface

Policy:

- Current minimum surface is `Canvas "Canway canvas"`, native toolbar buttons with labels/titles, and a polite live status region.
- Status remains concise: selection, cursor coordinate when available, drawn/total count, and last model change.
- Node labels and selection are not exposed as offscreen structured content yet because that would define product semantics not present in this foundation.

Evidence:

- DevTools accessibility snapshot showed `Canvas "Canway canvas"` and `status atomic live="polite"`.
- `npm run probe:canvas` asserted `statusRole: "status"` and `statusLive: "polite"`.

## Multi-Touch Policy

Policy:

- Multi-touch gestures are explicitly unsupported.
- The first active pointer owns the current interaction.
- Unrelated touch pointers are ignored; they do not commit, cancel, move, resize, or pan the active interaction.
- Future pinch/pan gestures need a separate gesture-state design.

Evidence:

- Second pointer move/up/cancel/lostcapture during node drag produced no commit until active pointer up; final active commit was one `node-move`.
- Second pointer during resize was ignored; final active commit was one `node-resize`.
- Second pointer during pan left camera unchanged; active pointer movement then moved camera and emitted zero model changes.

## Long-Run Churn And Memory

Automated probe ran 60 mount/interaction/dispose cycles. Each cycle did drag commit, resize commit, canceled drag, canceled pan, four wheel events, two theme toggles, and dispose.

Results:

- `modelCallbackCount: 120`, matching `expectedModelCallbacks: 120`.
- `statusCallbackCount: 120`.
- Listener balances all `0` for `canvas:pointerdown`, `canvas:pointercancel`, `canvas:lostpointercapture`, `canvas:wheel`, `canvas:dblclick`, `window:pointermove`, `window:pointerup`, and `window:blur`.
- `performance.memory` was available in Chrome; used heap went from `9574104` to `8085538`. This is not a benchmark, but it did not show an obvious leak.

## Future Model-Shape Stress

Automated cases:

| Case | Rendered/Total | Window | Result |
| --- | ---: | ---: | --- |
| 1,000 nodes | 1000/1000 | 49.6 ms | coherent |
| 2,000 nodes | 2000/2000 | 47.8 ms | coherent |
| dense overlap | 180/180 | 48.1 ms | coherent |
| extreme coordinates | 0/2 | 49.6 ms | coherent |
| min-size nodes | 2/2 | 51.2 ms | coherent |
| very wide/tall | 2/2 | 49.1 ms | coherent |
| long text | 1/1 | 50.8 ms | coherent |
| mixed near/far | 1/3 | 50.0 ms | coherent |
| unusual valid ids/labels | 2/2 | 47.6 ms | coherent |

All cases had `modelCallbackCount: 0`, `cullingCoherent: true`, and no captured errors.

## Console And Network

`npm run probe:canvas` browser events:

- `[vite] connecting...`
- `[vite] connected.`
- React DevTools development info message.

Live DevTools against `http://127.0.0.1:5179/`:

- Console: same expected Vite/React development messages only.
- Network: 16 requests, all `200`, including `/`, `@vite/client`, React deps, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/engine/CanvasEngine.ts`, `src/engine/sampleModel.ts`, and `src/engine/theme.ts`.

## Required Command Results

```bash
npm run build
```

Passed:

- `tsc --noEmit`
- `vite build`
- `1568 modules transformed`
- `dist/index.html 0.71 kB`
- `dist/assets/index-moFJVqio.css 2.99 kB`
- `dist/assets/index-D1PnLCKm.js 157.24 kB`

```bash
npm audit --omit=dev
```

Passed: `found 0 vulnerabilities`.

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Passed: Vite ready in `95 ms`, local URL `http://127.0.0.1:5179/`; used for DevTools inspection.

Targeted search results:

- Input/a11y search confirmed the active event/focus surface is in `src/engine/CanvasEngine.ts`, `src/App.tsx`, `src/styles.css`, and the probe/report docs.
- Listener/model/data search confirmed engine ownership for `ResizeObserver`, event listeners, frame scheduling, pointer capture, dataset counters, and model callbacks.
- TODO/FIXME/hack/suppression search found no source TODO/FIXME/hack/suppression markers. The only source `throw new Error` remains the missing 2D canvas context guard.

## Residual Risks

- This is still not a product-complete accessible canvas. Nonvisual node inspection/manipulation must be designed with the real product model.
- Multi-touch pinch/rotate/two-finger pan is not implemented; current policy is ignore unrelated pointers.
- The automated probe depends on local Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. CI would need either that path, a configurable Chrome path, or Playwright/browser provisioning.
- The model-shape stress checks correctness and obvious runtime errors, not detailed frame-time profiling.

## Final Recommendation

Use this foundation for the next product-layer step. Keep `npm run probe:canvas` as the regression gate for foundation changes. Do not claim perfection until the product-specific accessibility/keyboard object model exists and the browser probe is wired into the project’s actual CI environment.
