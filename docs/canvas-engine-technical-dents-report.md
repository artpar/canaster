# Canvas Engine Technical Dents Report

Date: 2026-06-14

## Executive Verdict

Reliable enough.

The current Canway canvas foundation is reliable enough to build the next product layer on after two small foundation issues fixed during this investigation. The verified engine now has clean model-change boundaries for zero-delta drag/resize moves, bounded small-node detail text layout, high-DPI rendering, fit/reset/toolbar/wheel/double-click zoom behavior, interruption rollback, viewport culling, lifecycle cleanup, React model re-handoff, and stress coverage through 1,000 runtime nodes.

No larger confirmed issue remains unfixed. The main residual risk is lack of checked-in browser interaction regression tests.

## Confirmed Issues Fixed

### 1. Zero-Delta Pointer Moves Emitted Model Changes

Severity: medium

Source proof:

- Before this report, `onPointerMove` set `drag.moved = true` for node drag and resize on every pointermove, even if geometry stayed identical.
- `finishPointerInteraction` emits `node-move` or `node-resize` whenever `drag.moved` is true.

Fix:

- Node drag and resize now set `drag.moved` from actual geometry comparison, not from pointermove presence.
- Added `sameNodeGeometry` to compare current geometry with the interaction's original geometry.

Source references:

- `src/engine/CanvasEngine.ts:329` to `src/engine/CanvasEngine.ts:337`
- `src/engine/CanvasEngine.ts:549` to `src/engine/CanvasEngine.ts:550`

Verification:

- Direct engine probe:
  - hover changes: `0`
  - selection changes: `0`
  - zero-delta drag changes: `0`
  - no-op resize changes after prior drag: unchanged at `1`
  - zero-delta resize changes: unchanged at `1`
  - real drag changes: exactly `1`, `node-move source`
  - real resize changes: exactly `1`, `node-resize source`

### 2. Min-Height Nodes Could Draw Detail Text Below The Node

Severity: low

Source proof:

- The engine permits resize down to `MIN_NODE_H = 76`.
- Detail text previously always allowed up to two fixed-position lines at `node.y + 56` and `node.y + 74`.
- The second line could extend below a 76px node, and detail text could collide with the kind label.

Fix:

- Detail line count is now computed from node height and available vertical space above the kind label.
- At the 76px minimum height, detail line capacity is `0`; larger nodes get one or two lines as space allows.

Source references:

- `src/engine/CanvasEngine.ts:260` to `src/engine/CanvasEngine.ts:264`
- `src/engine/CanvasEngine.ts:598` to `src/engine/CanvasEngine.ts:605`

Verification:

- Direct render probe with one `140x76` node and long label/detail:
  - rendered/total: `1/1`
  - sampled pixels below the node at y `119`, `125`, `132`: `[31,38,48,255]`, `[31,38,48,255]`, `[31,38,48,255]`
  - Result: no detail text painted below the node.

## Confirmed Issues Not Fixed

None.

## Suspected But Unconfirmed Risks

- There is no checked-in browser interaction regression harness. The runtime probes in this report are repeatable scripts run through Chrome DevTools, but they are not yet part of `npm test` or CI.
- The engine still uses transient in-engine model mutation during drag and resize before emitting a cloned committed snapshot on pointer-up. The current behavior is verified, but future undo/redo, collaboration, persistence, or multi-cursor work should introduce explicit transactions before extending this pattern.
- Stress coverage reached 1,000 simple nodes in the browser and remained responsive enough for the foundation. This does not prove performance for future rich domain-specific nodes, connection routing, labels, minimaps, or export.

## State-Machine Map

| State | Owner | Transient/committed | Rollback | `onModelChange` allowed | Render required | Status required | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Idle, no selection | Engine owns camera/hover; React owns model/theme/status display | committed | none | no | only when dirty | yes after model/camera/status change | app initial `No selection`, `Drawn 4/4`, `No model changes` |
| Idle, selection | Engine `selectedNodeId`; React status mirrors it | committed engine UI state | cleared by background pointerdown or invalid model handoff | no | yes for selection stroke | yes | selection probe: `Selected source`, last change `No model changes` |
| Hovering node | Engine `hoverNodeId` and cursor | transient | replaced by next hover | no | yes on hover target change | yes | direct hover model-change delta `0` |
| Drag candidate before movement | Engine `drag` with original geometry | transient | cancel restores original geometry | no | selection render only | yes | no-op down/up and zero-delta move emitted `0` changes |
| Active node drag | Engine mutates private cloned node geometry | transient until pointer-up | cancel/lost-capture/blur restores original geometry | only on successful pointer-up with changed geometry | yes | yes | real drag emitted one `node-move`; cancel emitted `0` and original hit target restored |
| Active resize | Engine mutates private cloned node size | transient until pointer-up | cancel/lost-capture/blur restores original geometry | only on successful pointer-up with changed geometry | yes | yes | real resize emitted one `node-resize`; zero-delta resize emitted `0` |
| Active pan | Engine camera | transient until pointer-up, but no model commit | cancel/lost-capture/blur restores original camera | no | yes | yes | pan blur preserved world coordinate `{x:0,y:0}` before/after; successful/canceled pan changes `0` |
| Wheel zoom | Engine camera | committed viewport state | none | no | yes | yes | app zoom `122% -> 180%`, cursor anchor `{x:105,y:24}` before/after |
| Double-click zoom | Engine camera | committed viewport state | none | no | yes | yes | direct double-click model-change delta `0` |
| Fit/reset/toolbar zoom | React button calls engine camera methods | committed viewport state | none | no | yes | yes | fit reported `Drawn 4/4`; toolbar remained usable after theme switch |
| Theme switch | React `theme`, document dataset, engine theme | committed UI state | next switch | no | yes | no model status required | pixel changed `[16,18,23,255] -> [244,246,248,255]`; model changes `0` |
| ResizeObserver resize | Engine viewport bitmap and DPR | committed canvas state | next resize | no | yes | status via render | direct resize observer model-change delta `0`; app bitmap `2560x1800` for CSS `1280x900`, DPR `2` |
| React model re-handoff after `onModelChange` | React owns committed model; engine clones via `setModel(..., preserveInteraction: true)` | committed model | invalid selection/hover cleared by id check | no extra change | yes | yes | app drag ended `Selected source` with `node-move source`; direct emitted snapshot geometry matched final committed model |
| Dispose/unmount | React effect cleanup calls engine `dispose` | terminal | pending frames no-op | no | no | no | listener add/remove counts balanced at `0`; disposed queued status calls `0`; disposed move changes `0` |

## Interaction Matrix

| Axis | Covered | Partially Covered | Uncovered |
| --- | --- | --- | --- |
| Target | background pan/cancel, unselected node selection, selected node drag, selected resize handle, overlapping nodes through direct stress, toolbar buttons | overlapping hit priority was covered by stress/render counts, not every overlapping drag path | keyboard-only canvas interaction |
| Input type | pointerdown/move/up, pointercancel, lostpointercapture, window blur, wheel, double-click, toolbar click, ResizeObserver resize | keyboard focus/blur only indirectly through canvas focus and window blur | assistive-technology activation paths |
| Gesture size | no movement, zero-delta pointermove, normal movement, large movement, movement outside canvas/window via window events | sub-pixel physical movement was represented by zero-delta and normal synthetic moves, not fractional browser hardware input | multi-touch gestures |
| Camera | fit scale, zoomed in, panned far from origin, default scale with negative/edge coordinates, DPR 2 | zoomed far out covered by wheel stress, not pixel-perfect text sampling at every scale | emulated DPR above 2 and below 1 |
| Model shape | empty, one node, 4 sample nodes, 100 nodes, 1,000 nodes, overlapping nodes, negative coordinates, far origin, very wide/tall nodes, long labels/details, min-height nodes | many-node profiling measured responsiveness and counters, not frame-by-frame flame charts | future product-specific shapes, connections, export surfaces |
| Lifecycle timing | normal, during active drag, during active resize, during active pan, immediately after model commit, immediately after theme toggle, after canvas resize, dispose/remount | React StrictMode duplicate mount behavior not separately enabled | hot module replacement cleanup beyond observed Vite reload |

## Model-Change Boundary Invariants

| Invariant | Result | Evidence |
| --- | --- | --- |
| Hover must not emit model changes | proven | direct hover delta `0` |
| Selection must not emit model changes | proven | app `Selected source ... No model changes`; direct selection delta `0` |
| Pan must not emit model changes | proven | successful pan and canceled pan deltas `0` |
| Fit/reset/button zoom must not emit model changes | proven | fit/toolbar changed zoom/render status only; no callback path in source outside drag/resize |
| Wheel zoom must not emit model changes | proven | direct wheel delta `0`; app last change unchanged |
| Double-click zoom must not emit model changes | proven | direct double-click delta `0` |
| Theme toggle must not emit model changes | proven | direct theme delta `0`; app pixel/theme changed without model change |
| Canvas resize must not emit model changes | proven | direct ResizeObserver delta `0` |
| Canceled drag/resize/pan must not emit model changes | proven | canceled drag delta `0`; resize blur delta `0`; pan cancel delta `0` |
| Successful drag emits exactly one `node-move` | proven | direct real drag count moved `0 -> 1`, change `node-move source` |
| Successful resize emits exactly one `node-resize` | proven | direct real resize count moved `1 -> 2`, change `node-resize source` |
| No-op node down/up emits no `node-move` | proven | direct selection/down-up left count `0` |
| No-op resize handle down/up emits no `node-resize` | proven | direct handle down-up left count unchanged |
| Zero-delta pointermove emits no model change | proven after fix | direct zero-delta drag `0`; zero-delta resize unchanged |
| Emitted snapshot matches final visible geometry | proven | direct drag snapshot moved source by `85.06,42.53` world units for a `60,30` screen move at fit scale; app status kept `Selected source` after React handoff |
| React re-handoff does not overwrite committed geometry | proven | app drag ended with committed `node-move source` and valid selection; engine `setModel(... preserveInteraction: true)` preserves id-valid selection |
| React re-render does not unexpectedly clear valid selection | proven | app drag status after model handoff: `Selected source ... node-move source` |

## Render Correctness

| Invariant | Result | Evidence |
| --- | --- | --- |
| Bitmap size equals CSS size times capped DPR | proven | app CSS `1280x900`, bitmap `2560x1800`, `data-dpr=2` |
| Canvas remains nonblank after mount | proven | app sampled 5 pixels, 3 unique colors |
| Canvas remains nonblank after fit/zoom/pan/theme/model commit | proven | app probes produced rendered counters and color changes after those actions |
| Text, node geometry, selection stroke, and resize handle stay attached under zoom | proven by source plus interaction evidence | all node drawing occurs under the same world transform in `drawNode`; resize handle hit tests and drawing share `resizeHandleRect` |
| Visible nodes are not culled | proven | sample fit `4/4`; edge-crossing model `1/1` |
| Fully offscreen nodes are culled | proven | offscreen direct model `0/1`; far app pan `0/4` |
| Nodes crossing viewport edges still render | proven | edge-crossing direct model rendered `1/1` |
| Theme switch fully redraws visible colors | proven | app background pixel `[16,18,23,255] -> [244,246,248,255]`, button label switched to dark theme |
| Long labels/details stay inside current foundation bounds | proven after fix for min-height case | min-height long-detail node rendered `1/1`; below-node samples stayed background/node color with no text paint |
| Empty model does not crash and leaves coherent canvas/status | proven | empty stress case `0/0`, nonblank color count `1`, no console error |

## Lifecycle Cleanup Findings

| Check | Result | Evidence |
| --- | --- | --- |
| Event listeners added by engine are removed on dispose | proven | listener counter balance for `canvas:pointerdown`, `canvas:pointercancel`, `canvas:lostpointercapture`, `canvas:wheel`, `canvas:dblclick`, `window:pointermove`, `window:pointerup`, `window:blur` all `0` |
| Queued render frame after dispose does not draw or throw | proven | three create/dispose cycles produced `error: null` |
| Queued status frame after dispose does not call state setters | proven | disposed-before-RAF status calls `0` |
| Active drag/resize/pan followed by cleanup does not leave stale global listeners | proven | active drag dispose balanced listeners and later window move/up produced `0` changes |
| Re-mounting does not duplicate handlers | proven | three direct mount/dispose cycles balanced listener counts to `0` |
| ResizeObserver is disconnected | proven indirectly | style resize after dispose produced no error and no status/model callback |

## Stress Findings

Runtime-only models were created through Chrome DevTools by importing `CanvasEngine` from Vite. They were not added as product fixtures.

| Case | Rendered/total | Model changes | Status callbacks | Elapsed probe window |
| --- | --- | --- | --- | --- |
| 0 nodes | `0/0` | `0` | `1` | `49.6ms` |
| 1 node | `1/1` | `0` | `1` | `46.6ms` |
| sample 4 nodes | `4/4` | `0` | `1` | `49.8ms` |
| 100 nodes | `100/100` | `0` | `1` | `50.6ms` |
| 1,000 nodes | `1000/1000` | `0` | `1` | `43.0ms` |
| long/min-size text model | `8/8` | `0` | `1` | `50.7ms` |
| negative coordinates | `30/30` | `0` | `1` | `49.9ms` |
| far origin | `30/30` | `0` | `1` | `49.9ms` |
| very wide/tall nodes | `10/10` | `0` | `1` | `49.9ms` |
| overlapping nodes | `12/12` | `0` | `1` | `50.0ms` |

Repeated rapid wheel events and repeated theme toggles in the stress loop produced no model changes and no console errors.

Additional interaction stress:

- Six repeated rapid drag commits produced `6` total model changes, all `node-move`, with per-commit counts `[1,1,1,1,1,1]`.
- Canvas resize during active drag produced one `node-move`, rendered `4/4`.
- Canvas resize during active resize produced one `node-resize`, rendered `4/4`.
- Canvas resize during active pan produced zero model changes, rendered `4/4`.

## Runtime Probe Evidence

Commands run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Final command results:

- `npm run build`: passed after fixes. Vite built `dist/index.html`, `dist/assets/index-Vnlp3ZLr.css`, and `dist/assets/index-A6uqIW7J.js`.
- `npm audit --omit=dev`: `found 0 vulnerabilities`.
- `npm run dev`: Vite served the app at `http://localhost:5173/`.

Targeted source searches run:

```bash
rg -n "addEventListener|removeEventListener|requestAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|onModelChange|setModel|dataset|canvas\\.width|canvas\\.height" src
rg -n "node-move|node-resize|selectedNodeId|hoverNodeId|drag|dispose|blur|lostpointercapture|pointercancel" src
```

Important search findings:

- Engine listener registration and cleanup are paired in `CanvasEngine`.
- Model changes are emitted only through `emitModelChange`, reached from `finishPointerInteraction` for `node-move` and `node-resize`.
- `setModel(..., { preserveInteraction: true })` is only used by the React model handoff effect.
- Canvas bitmap sizing, DPR, and culling counters are written by the engine.

Browser app probes:

| Probe | Evidence | Result |
| --- | --- | --- |
| Initial nonblank high-DPI canvas | CSS `1280x900`, bitmap `2560x1800`, DPR `2`, rendered `4/4`, 3 unique sampled colors | pass |
| Wheel zoom anchor | zoom `122% -> 180%`; cursor world `{x:105,y:24}` before/after at same screen point | pass |
| Fit renders sample | zoom `122%`, rendered `4/4` | pass |
| Selection boundary | `Selected source ... No model changes` | pass |
| Drag commit and React handoff | `Selected source ... node-move source` | pass |
| Far pan culling | rendered `0/4` | pass |
| Theme redraw | pixel `[16,18,23,255] -> [244,246,248,255]`; document theme `light`; button changed to `Switch to dark theme` | pass |

Direct engine probes:

| Probe | Evidence | Result |
| --- | --- | --- |
| Model-change non-events | wheel, double-click, theme, ResizeObserver, successful pan, canceled pan, canceled drag all delta `0` | pass |
| Zero-delta drag/resize | no callback emitted after fix | pass |
| Real drag/resize | exactly `node-move source`, exactly `node-resize source` | pass |
| Cancel rollback | after canceled drag: moved-only hit selected `null`, original hit selected `source`, changes `0` | pass |
| Lost capture and blur | lost-capture drag changes `0`; resize blur changes `0`; pan blur world point stable `{x:0,y:0}` | pass |
| Culling edges | crossing-edge node `1/1`; fully offscreen node `0/1` | pass |
| Lifecycle cleanup | all listener counter balances `0`; queued disposed status calls `0`; error `null` | pass |
| Repeated rapid drag commits | six commits produced six `node-move` changes, one per commit | pass |
| Canvas resize during interactions | active drag `node-move` delta `1`; active resize `node-resize` delta `1`; active pan delta `0`; rendered `4/4` | pass |

Console and network:

- Network: 35 observed Vite/module requests, all HTTP `200`.
- Console: Vite connect/debug messages, React DevTools informational messages, and one Canvas2D `getImageData` readback warning from the audit probes. No app error was logged.

## Regression Strategy

No checked-in Playwright/browser harness was added in this pass.

Reason:

- The repo currently has no test script or browser automation dependency.
- Adding Playwright would be a non-trivial dependency/config expansion for a tiny Vite app.
- The active prompt allowed a documented browser/devtools probe when adding a test dependency would be too much.

Recommended next regression task:

- Add a small browser-driven interaction suite once the next layer starts. The highest-value tests are:
  - no model change for hover/selection/zoom/pan/theme/resize observer;
  - exactly one model change for real drag and resize;
  - zero changes for zero-delta pointermove, pointercancel, lostpointercapture, and window blur;
  - culling `1/1` crossing edge and `0/1` fully offscreen;
  - lifecycle listener add/remove balance across mount/unmount.

## Final Recommendation

Proceed with the next product layer, but keep the first product-layer task narrow and add a checked-in browser interaction suite before introducing persistence, undo/redo, collaboration, domain-specific node complexity, connection routing, export, or canvas-library replacement.

The foundation is not perfect, but the remaining gaps are regression-automation and future-scale risks, not confirmed blockers in the current engine.
