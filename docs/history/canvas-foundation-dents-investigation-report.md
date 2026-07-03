# Canvas Foundation Dents Investigation Report

Date: 2026-06-14

## Executive Verdict

Reliable enough.

This is not a perfect foundation. The current code is reliable enough for the next narrow product-layer step after one additional foundation issue was found, fixed, and verified in this investigation. The remaining gaps are not known blockers, but they are real: deeper keyboard/assistive-tech behavior, multi-touch, exhaustive DPR/device coverage, HMR edge cases, and future complex product-specific models are not fully proven.

## Confirmed Issues Fixed

### Selected Resize Handle Lost Priority When It Overlapped Another Node

Severity: medium

Reproduction evidence:

- A browser runtime probe repeatedly enlarged the selected `source` node until its bottom-right resize handle overlapped later/topmost nodes.
- Before the fix, the rapid resize probe emitted this sequence after six valid drags: `node-resize`, `node-resize`, then `node-move`, `node-move` for later resize attempts.
- Root cause: `onPointerDown` called `nodeAt(world)` before checking the selected node's resize handle. When the selected handle overlapped another node, topmost-node hit testing stole the event and started a node drag.

Fix:

- `onPointerDown` now checks the currently selected node's resize handle before general node hit testing.
- Cursor calculation now gives the selected resize handle the same priority.

Source references:

- `src/engine/CanvasEngine.ts:286` to `src/engine/CanvasEngine.ts:299`
- `src/engine/CanvasEngine.ts:422` to `src/engine/CanvasEngine.ts:430`

Verification:

- Focused overlapping-handle probe ran eight consecutive resize commits over overlapping areas.
- Result: all eight commits emitted exactly one `node-resize source`; no `node-move` was emitted.
- Checked-in probe `docs/canvas-foundation-devtools-probe.js` repeated this path successfully:
  - `overlappingResize.counts`: eight entries.
  - every entry: `delta: 1`, `change.kind: node-resize`, `nodeId: source`.

## Confirmed Issues Not Fixed

None.

## Suspected But Unconfirmed Risks

- Transient in-engine geometry mutation during drag/resize is verified for the current imperative engine, but future undo/redo, persistence, collaboration, or multi-cursor behavior should introduce explicit transactions rather than extending this pattern casually.
- Stress coverage uses simple rectangular nodes. It does not prove performance or visual coherence for future rich product-specific node content.
- The checked-in browser probe is a DevTools/Vite module, not a CI test. It improves repeatability but still requires a running app and browser.

## Untested Or Partially Tested Areas

| Area | Status | Reason |
| --- | --- | --- |
| Keyboard-only canvas interaction | partially tested | Toolbar buttons are native buttons, but the canvas has no keyboard interaction contract yet. |
| Assistive technology workflows | untested | No accessibility interaction model exists for canvas content beyond the canvas label and toolbar buttons. |
| Multi-touch and touch-specific gestures | untested | The engine uses pointer events and `touch-action: none`, but multi-touch semantics are not implemented. |
| DPR matrix beyond current/low DPR | partially tested | Runtime verified DPR `2` and emulated DPR `1`; fractional DPR and DPR above cap were not exhaustively sampled. |
| HMR cleanup | partially tested | Vite HMR was observed during probes without errors, but duplicate-handler behavior was not stress-tested as a formal invariant. |
| Heap growth | partially tested | Listener/callback cleanup was proven; heap snapshots were not taken because no listener/callback leak was reproduced. |

## State Inventory

| State | Owner | Write sites | Read sites | Commit / rollback | Divergence risk | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| React `model` | React `App` | initial sample clone, `onModelChange` | model handoff effect | committed on model callback | stale handoff could overwrite engine | drag app probe preserved committed `node-move source` |
| React `theme` | React `App` | theme button | theme effect, button label | committed immediately | engine/document theme could diverge | theme probe changed pixel and `documentElement.dataset.theme` |
| React `status` | React `App` | engine `onStatus` | statusbar and zoom readout | coalesced by engine RAF | stale during RAF delay | status probes reported expected zoom/selection/counters |
| React `lastModelChange` | React `App` | `onModelChange` | statusbar | committed on model callback | false positives if engine emits incorrectly | model-boundary probe counts verified |
| Engine cloned model | `CanvasEngine` | `setModel`, drag/resize mutation | render, hit test, emit snapshot | committed snapshot on pointer-up | transient mutation before commit | cancel/blur/lost-capture rollback probes passed |
| Engine camera | `CanvasEngine` | fit, zoom, pan, resize-independent methods | render, hit test, status | committed viewport state, pan rollback on cancel | stale status/cursor possible | wheel anchor, pan blur, far pan culling passed |
| Selection/hover | `CanvasEngine` | pointerdown, pointermove, model handoff validation | render, cursor, status | UI state, invalid ids cleared by `setModel` | valid selection could clear on React handoff | app drag retained `Selected source` |
| Drag state | `CanvasEngine` | pointerdown, pointermove, finish interaction | pointermove/up/cancel/blur/lost capture | commit on pointer-up, rollback on interruption | wrong target/commit type | overlapping handle issue found and fixed |
| Canvas bitmap/DPR | DOM owned by engine | `resize()` | render, dataset, probes | committed on ResizeObserver | CSS/bitmap mismatch | app `1280x900` CSS, `2560x1800` bitmap, DPR `2`; low DPR `320x240` |
| Render counters | DOM dataset | `render()` | statusbar/probes | updated per render | stale before first render | sample `4/4`, far pan `0/4`, edge `1/1`, offscreen `0/1` |
| Listener/observer state | Browser + engine | constructor/dispose | browser event loop | removed/disconnected on dispose | leaks/duplicate callbacks | listener balances all `0`; disposed changes `0` |

## State-Machine Transition Table

| Transition | Trigger | Mutated state | Transient/committed | Rollback | Model change allowed | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Idle no selection | mount/setModel/fit | model, camera, canvas status | committed | none | no | app initial `No selection`, `Drawn 4/4` |
| Idle with selection | node pointerdown/up | selected id | committed UI state | background clears | no | selection delta `0`, status `Selected source` |
| Hover node | pointermove | hover id, cursor world | transient | next move/model handoff | no | hover delta `0` |
| Drag candidate | pointerdown on node | drag state, selected id | transient | pointercancel/blur/lost capture | no until moved pointer-up | no-op and zero-delta drag delta `0` |
| Active node drag | pointermove after node down | private node geometry | transient until commit | original geometry restored | yes, exactly one on changed pointer-up | real drag delta `1`, `node-move source` |
| Active resize | pointermove after handle down | private node size | transient until commit | original geometry restored | yes, exactly one on changed pointer-up | real resize delta `1`, `node-resize source` |
| Active pan | background pointermove | camera x/y | transient until pointer-up | original camera restored | no | successful/canceled pan deltas `0`; pan blur world point stable |
| Wheel zoom | wheel | camera scale/x/y | committed viewport | none | no | zoom `122% -> 180%`, same cursor world `{x:105,y:24}` |
| Double-click zoom | dblclick | camera scale/x/y | committed viewport | none | no | direct double-click delta `0` |
| Toolbar zoom/fit/reset | button click | camera | committed viewport | none | no | fit rendered `4/4`; toolbar usable after theme |
| Theme switch | theme button/effect | React theme, document dataset, engine theme | committed UI state | next switch | no | pixel `[16,18,23,255] -> [244,246,248,255]` |
| ResizeObserver resize | canvas/CSS resize | view size, bitmap, DPR | committed canvas state | next resize | no | canvas resize delta `0`; low-DPR probe passed |
| React model re-handoff | `setModel(... preserveInteraction)` | engine model clone, valid selection/hover | committed model | invalid ids cleared | no extra change | drag app probe retained selection and committed change |
| Dispose/unmount | React cleanup / direct dispose | disposed flag, listeners, observer | terminal | no-op pending frames | no | balanced listener counters and disposed changes `0` |
| HMR reload | Vite update/reload | module/runtime replacement | committed dev-runtime state | Vite reload | no | observed Vite HMR/debug messages without app errors; not stress-proven |

## Interaction Cross-Product Matrix

| Axis | Runtime-proven | Source-proven | Partially covered | Untested |
| --- | --- | --- | --- | --- |
| Target | background, unselected node, selected node body, selected resize handle, overlapping resize handle, toolbar buttons, viewport edge culling | canvas outside any node starts pan | overlapping body drag priority beyond resize handle | keyboard-only canvas target |
| Input | pointerdown/move/up, pointercancel, lostpointercapture, window blur, wheel, double-click, toolbar click, rapid repeated input | focus call on pointerdown | keyboard activation for toolbar native buttons | multi-touch |
| Gesture size | no movement, zero-delta move, normal move, large move, outside canvas/window, repeated resize/drag | direction reversal follows same geometry comparison | sub-pixel movement represented indirectly by zero-delta/small moves | hardware fractional-pointer traces |
| Camera | fit scale, zoomed in, far pan, negative world coordinates, low DPR, high DPR 2 | max DPR cap from source | zoomed-out text sampled indirectly through wheel stress | fractional DPR values |
| Model shape | empty, one, sample, 100, 1,000, overlapping, offscreen, crossing edge, negative, far origin, min-size, wide/tall, long text, unusual ids | typed node shape | future product-specific rich nodes | invalid runtime node objects outside TypeScript contract |
| Lifecycle timing | normal, active drag/resize/pan during resize, before dispose, after dispose, after remount-like direct cycles | React cleanup effect calls dispose | HMR observed only as dev logs | formal HMR duplicate-listener stress |

## Model-Change Boundary Evidence

| Invariant | Result | Evidence |
| --- | --- | --- |
| Hover emits no model changes | proven | direct delta `0` |
| Selection emits no model changes | proven | direct delta `0`; app status `No model changes` |
| Pan emits no model changes | proven | successful pan delta `0`; canceled pan delta `0` |
| Fit/reset/button zoom emits no model changes | proven | app toolbar/fit changed viewport only; source emits only drag/resize |
| Wheel zoom emits no model changes | proven | direct delta `0` |
| Double-click zoom emits no model changes | proven | direct delta `0` |
| Theme toggle emits no model changes | proven | direct delta `0` |
| Canvas resize emits no model changes | proven | direct delta `0` |
| Canceled drag restores geometry and emits no model change | proven | drag blur/cancel delta `0`; moved-only hit selected `null`, original hit selected `source` |
| Canceled resize emits no model change | proven | resize blur delta `0` |
| Canceled pan restores camera | proven | world before/after pan blur `{x:0,y:0}` |
| No-op node down/up emits no `node-move` | proven | selection/no-op delta `0` |
| Zero-delta drag emits no `node-move` | proven | delta `0` |
| No-op/zero-delta resize emits no `node-resize` | proven | zero-delta resize delta `0` |
| Successful drag emits exactly one `node-move` | proven | real drag delta `1`, `node-move source` |
| Successful resize emits exactly one `node-resize` | proven | real resize delta `1`, `node-resize source` |
| Repeated rapid drag commits emit one each | proven | six drags produced per-commit `[1,1,1,1,1,1]` |
| Repeated rapid resize commits emit one each | proven after fix | eight overlapping resize commits all `node-resize source`, delta `1` each |
| Emitted snapshot matches final visible geometry | proven | model snapshots fed subsequent handle calculations and app retained committed status |
| React handoff does not overwrite committed geometry | proven | app drag ended with `Selected source`, `node-move source` |
| Invalid selection/hover ids clear on missing model node | source-proven | `setModel` preserves ids only when `some(node.id === id)` |

## Render Correctness Evidence

| Invariant | Result | Evidence |
| --- | --- | --- |
| Bitmap size equals CSS size times capped DPR | proven | app CSS `1280x900`, bitmap `2560x1800`, DPR `2`; low DPR `320x240` |
| Canvas remains nonblank after mount | proven | app sampled 4 pixels, 3 unique colors |
| Canvas remains nonblank after fit/zoom/pan/theme/model commit | proven | rendered counters and pixels changed through app probes |
| Text/geometry/selection/hover/handle stay attached under zoom | source-proven plus interaction-proven | all node drawing uses one world transform; handle draw/hit share `resizeHandleRect` |
| Hit testing and rendering use compatible geometry | proven | node center/handle probes selected, dragged, and resized expected node |
| Visible nodes are not culled | proven | sample `4/4`, edge crossing `1/1` |
| Fully offscreen nodes are culled | proven | offscreen direct model `0/1`; far pan app `0/4` |
| Theme switch redraws colors | proven | background pixel changed dark to light; toolbar remained usable |
| Long/min-size nodes render coherently | proven | min node `1/1`; below-node samples were node/background color with no text spill |
| Empty model does not crash | proven | stress `0/0`, no console error |
| Very large/small coordinates avoid NaN/blank | proven | huge coord `1/1`, tiny coord `1/1`, finite status values |

## Lifecycle Cleanup Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Event listeners removed on dispose | proven | `canvas:pointerdown`, `pointercancel`, `lostpointercapture`, `wheel`, `dblclick`, `window:pointermove`, `pointerup`, `blur` all balanced to `0` |
| ResizeObserver disconnected | proven indirectly | resize after dispose produced no callback/error |
| Queued render after dispose does not throw | proven | lifecycle error `null` |
| Queued status after dispose does not call React-like setter | proven | disposed lifecycle status calls `0` in full probe |
| Active drag/resize/pan followed by dispose leaves no stale listeners | proven | direct cycles during active interactions balanced counts and produced `0` changes after dispose |
| Remount/direct repeated construction does not duplicate handlers | proven | four constructor/dispose cycles balanced all listener counts |
| HMR duplicate handlers | partially tested | Vite HMR logs observed and app stayed functional; formal duplicate-listener HMR stress not run |

## Stress And Fault-Injection Findings

| Case | Rendered/total | Model changes | Status callbacks | Probe window |
| --- | --- | --- | --- | --- |
| 0 nodes | `0/0` | `0` | `1` | `48.3ms` |
| 1 node | `1/1` | `0` | `1` | `50.9ms` |
| sample model | `4/4` | `0` | `1` | `50.8ms` |
| 100 nodes | `100/100` | `0` | `1` | `49.8ms` |
| 1,000 nodes | `1000/1000` | `0` | `1` | `49.5ms` |
| long labels/details | `8/8` | `0` | `1` | `47.1ms` |
| min-size nodes | `8/8` | `0` | `1` | `50.9ms` |
| negative coordinates | `30/30` | `0` | `1` | `49.8ms` |
| far-origin nodes | `30/30` | `0` | `1` | `50.3ms` |
| very wide/tall nodes | `10/10` | `0` | `1` | `49.8ms` |
| overlapping nodes | `12/12` | `0` | `1` | `50.7ms` |
| unusual ids | `5/5` | `0` | `1` | `50.0ms` |

Additional fault-injection evidence:

- Rapid wheel bursts and rapid theme toggles caused `0` model changes.
- Canvas resize during active drag emitted one `node-move`, rendered `4/4`.
- Canvas resize during active resize emitted one `node-resize`, rendered `4/4`.
- Canvas resize during active pan emitted zero model changes, rendered `4/4`.
- Window blur during active drag/resize/pan emitted zero model changes and rolled back visible state/camera.
- Lost pointer capture during active drag emitted zero model changes.

## Console And Network Findings

- Network: 51 observed Vite/module requests, all HTTP `200`.
- Console: Vite connection/debug messages, React DevTools informational messages, Vite HMR messages, and Canvas2D readback warnings caused by the probe's repeated `getImageData` calls.
- No application error was logged.

## Command Results

Required commands run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Results:

- `npm run build`: passed after the overlapping-handle fix. Built `dist/index.html`, `dist/assets/index-Vnlp3ZLr.css`, and `dist/assets/index-C3GP3KFN.js`.
- `npm audit --omit=dev`: `found 0 vulnerabilities`.
- `npm run dev`: Vite served `http://localhost:5173/` and browser probes ran against that app.

Required source searches run:

```bash
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|onModelChange|setModel|dataset|canvas\\.width|canvas\\.height" src
rg -n "node-move|node-resize|selectedNodeId|hoverNodeId|drag|resize|pan|dispose|blur|lostpointercapture|pointercancel|wheel|dblclick" src
rg -n "TODO|FIXME|hack|any|as unknown|ts-ignore|eslint-disable|throw new Error|console\\." src docs
```

Search findings:

- Listener add/remove paths are paired in `CanvasEngine`.
- Model-change emission is limited to `node-move` and `node-resize`.
- No TODO/FIXME/hack/suppression markers were found in `src`; the only source `throw new Error` is the missing 2D canvas context constructor failure.

## Regression Strategy

Added a checked-in DevTools/Vite probe:

- `docs/canvas-foundation-devtools-probe.js`

Run it from the browser console while `npm run dev` is serving the app:

```js
const probe = await import('/docs/canvas-foundation-devtools-probe.js');
await probe.runCanwayFoundationProbe();
```

Verified result:

- App DPR/render counters: CSS `1280x900`, bitmap `2560x1800`, DPR `2`, rendered `4/4`.
- Model boundaries: hover/selection/zero-delta drag/zero-delta resize/wheel/double-click/theme/canvas resize all delta `0`; real drag and resize delta `1`.
- Overlapping resize: eight repeated overlapping handle commits all `node-resize source`, delta `1`.
- Culling: edge `1/1`, offscreen `0/1`.
- Lifecycle: all listener counters balanced to `0`, disposed changes `0`, error `null`.

This is not a full CI suite. The next regression step should be to make this browser probe runnable from `npm` in headless Chrome or replace it with a small Playwright suite if that dependency becomes acceptable.

## Final Recommendation

Proceed with the next narrow product-layer task, but do not call the foundation perfect. Keep product-layer changes small until the browser probe is promoted into an automated test harness. Before adding persistence, undo/redo, collaboration, complex domain-specific nodes, connection routing, export, or heavy rendering changes, add CI coverage for the model-change boundaries, interruption rollback, overlapping resize handle priority, culling, theme redraw, and lifecycle cleanup.
