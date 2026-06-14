# Canvas Foundation Remaining Reliability Report

Date: 2026-06-14

## Executive Verdict

Reliable enough.

This is still not perfect. The remaining investigation found one confirmed touch/multi-pointer reliability bug plus two small focus/accessibility surface dents, all fixed and verified. The current foundation is reliable enough for the next narrow product-layer step, but the canvas still lacks a defined keyboard interaction model, a nonvisual node representation, CI automation for browser probes, and exhaustive device/input coverage.

## Confirmed Issues Fixed

### 1. Second Touch Pointer Could Commit The First Pointer's Drag

Severity: medium

Reproduction:

- Start a touch drag on `source` with pointer id `21`.
- Send a `pointermove` and `pointerup` from a different touch pointer id `22`.
- Before the fix, the engine had a single `drag` state with no active pointer owner, so pointer `22` mutated and committed pointer `21`'s active drag.

Evidence before fix:

- `twoPointerCorruption.afterSecondPointerUp.changes`: `[{"kind":"node-move","nodeId":"source"}]`.
- The original pointer had not been released yet.

Fix:

- Store `pointerId` in every active drag state.
- Ignore `pointermove`, `pointerup`, `pointercancel`, and `lostpointercapture` events whose pointer id does not match the active drag owner.

Source references:

- `src/engine/CanvasEngine.ts:23` to `src/engine/CanvasEngine.ts:35`
- `src/engine/CanvasEngine.ts:289` to `src/engine/CanvasEngine.ts:331`
- `src/engine/CanvasEngine.ts:337` to `src/engine/CanvasEngine.ts:369`
- `src/engine/CanvasEngine.ts:487` to `src/engine/CanvasEngine.ts:493`

Verification:

- Checked-in probe result after fix:
  - `touchPointerOwnership.afterSecondPointer`: `[]`
  - `touchPointerOwnership.finalChanges`: `[{"kind":"node-move","nodeId":"source"}]`
- Meaning: the second pointer no longer commits or mutates the active drag; only the owning pointer can commit.

### 2. Focused Canvas Had No Visible Keyboard Focus Indicator

Severity: low

Reproduction:

- Focus the canvas programmatically or by tab order.
- Before the fix, computed canvas focus outline was `none`.

Fix:

- Added a visible `:focus-visible` outline for `.canvas-surface`.

Source reference:

- `src/styles.css:61` to `src/styles.css:64`

Verification:

- Post-fix computed outline: `solid 2px rgb(90, 167, 255)`.
- Keyboard events sent to the focused canvas did not change status or emit model changes.

### 3. Statusbar Had No Status/Live Semantics

Severity: low

Reproduction:

- DOM and accessibility snapshot showed the statusbar as a generic element with no `role` or `aria-live`.

Fix:

- Added `role="status"` and `aria-live="polite"` to the statusbar.

Source reference:

- `src/App.tsx:92`

Verification:

- DOM probe: `statusbarRole: "status"`, `statusbarAriaLive: "polite"`.
- Accessibility snapshot: `status atomic live="polite"`.

## Confirmed Issues Not Fixed

### Canvas Has No Nonvisual Node Representation

Severity: medium for accessibility, not a current engine blocker.

Evidence:

- Accessibility snapshot exposes `Canvas "Canway canvas"` and toolbar/status controls, but it does not expose individual nodes, node labels, coordinates, selection, or resize affordances as accessible objects.

User impact:

- Screen-reader users cannot inspect or operate canvas nodes through a nonvisual representation.

Recommended next task:

- Design a foundation-level accessibility model before product-specific content becomes complex. Do not patch this with ad hoc hidden text until the intended keyboard and nonvisual interaction model is defined.

### Canvas Keyboard Interaction Is Undefined

Severity: medium UX gap, not a current accidental-behavior bug.

Evidence:

- Canvas is in tab order and can receive focus.
- Focused canvas key events for `ArrowLeft`, `ArrowRight`, `+`, `-`, `Enter`, and `Space` did not change status or model state.
- There are no key handlers in source.

User impact:

- Keyboard users can reach the canvas but cannot select, pan, move, resize, or inspect nodes by keyboard.

Recommended next task:

- Define a keyboard interaction contract for the generic canvas before adding product-specific object behavior.

### Probe Is Still Browser-Manual, Not CI-Automated

Severity: medium regression risk.

Evidence:

- `docs/canvas-foundation-devtools-probe.js` is checked in and repeatable through Vite/DevTools.
- `package.json` has no `test` or probe script.
- No headless browser dependency is installed.

Recommended next task:

- Add a small headless browser runner or a Playwright suite when dependency cost is acceptable.

## Suspected But Unconfirmed Risks

- HMR cleanup was observed through Vite HMR logs without app errors, but formal duplicate-handler HMR stress remains partial.
- Memory growth evidence is browser-API based and short-run. It did not show growth in this probe, but it is not a long-duration soak test.
- Future product-specific node content could change text layout, hit testing, accessibility, and performance assumptions.

## Untested Or Partially Tested Areas

| Area | Status | Reason |
| --- | --- | --- |
| Full screen-reader workflow | partially tested | Accessibility tree was inspected, but no screen-reader interaction was run. |
| Multi-touch gestures | partially tested | Two-pointer corruption is fixed, but pinch/rotate semantics are intentionally unsupported. |
| Fractional pointer hardware traces | partially tested | Synthetic pointer events and DPR values were tested, not physical hardware. |
| HMR duplicate listener stress | partially tested | Vite HMR was observed, but not repeatedly forced through a formal harness. |
| Long memory soak | partially tested | 20 mount/dispose cycles and `performance.memory` were checked, not a long-running soak. |

## Probe Automation Decision

Decision: keep `docs/canvas-foundation-devtools-probe.js` as a checked-in manual browser probe for now.

Reason:

- The repo has no test runner or headless browser dependency.
- Adding Playwright only for this pass would be a larger dependency/configuration change than the current app justifies.
- The probe is still repeatable against the running Vite app and now covers the newly fixed touch pointer ownership case.

Exact command sequence used:

```bash
npm run dev
```

Then in the browser page context:

```js
const probe = await import('/docs/canvas-foundation-devtools-probe.js');
await probe.runCanwayFoundationProbe();
```

Verified checked-in probe result:

- app DPR/render counters: CSS `1280x900`, bitmap `2560x1800`, DPR `2`, rendered `4/4`.
- model boundaries: hover/selection/zero-delta drag/zero-delta resize/wheel/double-click/theme/canvas resize all delta `0`; real drag and resize delta `1`.
- overlapping resize: eight commits, all `node-resize source`, delta `1`.
- culling: edge `1/1`, offscreen `0/1`.
- touch pointer ownership: second pointer produced no changes; original pointer produced one `node-move source`.
- lifecycle: listener counters balanced to `0`, disposed changes `0`, error `null`.

## Keyboard And Focus Findings

| Check | Result | Evidence |
| --- | --- | --- |
| Tab order | proven | canvas first, then Fit, Reset, Zoom out, Zoom in, Theme |
| Toolbar focus visibility | proven | native buttons use `.icon-button:focus-visible` outline |
| Canvas focus after pointer/focus | proven | `focusedCanvas: true` |
| Canvas focus visibility | fixed/proven | outline changed from none to `solid 2px rgb(90, 167, 255)` |
| Focused canvas keyboard behavior | proven no accidental behavior | key events did not change status or model state |
| Native button activation | proven | Fit button preserved coherent zoom/status; theme button changed label and document theme once |
| Status coherence | proven | status text stayed coherent after canvas keys and button activation |

## Accessibility Surface Findings

| Check | Result | Evidence |
| --- | --- | --- |
| Canvas accessible name | proven | `Canvas "Canway canvas"` |
| Toolbar button names | proven | buttons expose Fit view, Reset zoom, Zoom out, Zoom in, Switch theme |
| Statusbar discoverability | fixed/proven | `role="status"`, `aria-live="polite"`; a11y snapshot shows polite live status |
| Selected node/status announcements | partially covered | status region can announce text updates, but no full screen-reader workflow was tested |
| Nonvisual canvas content | confirmed gap | nodes are not represented individually in the accessibility tree |
| Foundation acceptability | reliable enough with gap | acceptable for current visual foundation, needs accessibility design before complex product behavior |

## Touch And Pointer Findings

| Check | Result | Evidence |
| --- | --- | --- |
| touch drag | proven | `touchDrag.delta: 1`, `node-move source` |
| touch resize | proven | `touchResize.delta: 1`, `node-resize source` |
| touch pan | proven | `touchPan.delta: 0`, rendered `4` |
| pointercancel during touch drag | proven | `touchCancelDrag.delta: 0` |
| two active pointer ids | fixed/proven | second pointer produced no changes; owning pointer committed once |
| wheel absence on touch-only viewport | source/behavior note | no touch wheel semantics are implemented; wheel remains separate mouse/trackpad path |
| touch-action behavior | source-proven | `.canvas-surface { touch-action: none; }` |
| pointer capture behavior with touch ids | proven enough | touch pointer drag/resize/pan completed through captured active id; wrong id ignored after fix |

## DPR Matrix Findings

| Input DPR | Effective DPR | Bitmap after resize | Rendered/total | Hit test |
| --- | --- | --- | --- | --- |
| `1` | `1` | `360x260` | `4/4` | selected `source` |
| `1.25` | `1.25` | `450x325` | `4/4` | selected `source` |
| `1.5` | `1.5` | `540x390` | `4/4` | selected `source` |
| `2` | `2` | `720x520` | `4/4` | selected `source` |
| `3` | `2` | `720x520` | `4/4` | selected `source` |
| `4` | `2` | `720x520` | `4/4` | selected `source` |

The DPR cap at `2` is proven for high-DPR inputs.

## HMR And Remount Findings

| Check | Result | Evidence |
| --- | --- | --- |
| repeated direct engine construction/disposal | proven | 20 cycles completed with listener balances at `0` |
| React app remount | partially tested | page reload and Vite HMR observed; direct React root remount was not separately scripted |
| Vite HMR | partially tested | console showed hot updates for `src/App.tsx` and `src/styles.css`; no app errors |
| listener counts after cycles | proven | all engine listener counters balanced to `0` |
| model callbacks after disposal | proven | model counts stayed `0` in disposal/churn cycles |
| status callbacks after disposal | proven indirectly | status counts stayed bounded at `2` per cycle; lifecycle probe after dispose had no changes/errors |
| console errors during reload/HMR | proven for observed run | no app errors logged |

## Memory And Callback-Churn Findings

| Check | Result | Evidence |
| --- | --- | --- |
| repeated mount/dispose cycles | proven | 20 direct cycles |
| repeated wheel bursts | proven | 15 wheel events per cycle |
| repeated theme toggles | proven | light/dark toggle per cycle |
| status callback count per burst | bounded | `statusCounts`: twenty entries, all `2` |
| model callback count per successful commit | proven elsewhere | checked-in probe and touch probe show exact model counts |
| heap evidence | available | `performance.memory.usedJSHeapSize` went `8341390 -> 8331827` in the probe window |
| listener growth | not observed | listener balances all `0` |

## Future Model-Shape Stress Findings

| Case | Rendered/total | Model changes | Status callbacks | Elapsed |
| --- | --- | --- | --- | --- |
| dense overlap | `80/80` | `0` | `2` | `99.6ms` |
| long text | `20/20` | `0` | `2` | `76.6ms` |
| min-size nodes | `20/20` | `0` | `2` | `73.3ms` |
| wide/tall nodes | `20/20` | `0` | `2` | `76.2ms` |
| extreme negative coords | `60/60` | `0` | `2` | `85.8ms` |
| extreme positive coords | `60/60` | `0` | `2` | `87.7ms` |
| mixed far-near coords | `0/60` | `0` | `2` | `63.7ms` |
| unusual valid labels | `10/10` | `0` | `2` | `73.0ms` |
| 1,000 nodes | `769/1000` | `0` | `2` | `437.0ms` |
| 2,000 nodes | `1531/2000` | `0` | `2` | `765.9ms` |

Notes:

- The mixed far-near case rendered `0/60` because fit clamps at max scale and the model span is enormous; this is coherent culling, not a crash.
- 2,000 nodes is usable as stress evidence, not a benchmark promise.

## Console And Network Findings

- Console: Vite connect/debug messages, React DevTools info messages, Vite hot-update messages for `src/App.tsx` and `src/styles.css`, and Canvas2D readback warnings from repeated probe `getImageData` calls.
- No application error was logged.
- Network: 52 observed app/module/probe requests, all HTTP `200` or `304`; no failed requests.

## Command Results

Required commands run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Results:

- Baseline `npm run build`: passed.
- Baseline `npm audit --omit=dev`: `found 0 vulnerabilities`.
- `npm run dev`: served `http://localhost:5173/`; browser/runtime probes ran against this app.
- Post-fix `npm run build`: passed with `dist/assets/index-moFJVqio.css` and `dist/assets/index-DRsMGz1S.js`.
- Post-fix `npm audit --omit=dev`: `found 0 vulnerabilities`.

Required source searches run:

```bash
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|onModelChange|setModel|dataset|canvas\\.width|canvas\\.height" src
rg -n "keydown|keyup|keypress|tabIndex|aria-|role=|statusbar|focus|blur|pointerType|pointerId|touch|lostpointercapture|pointercancel|wheel|dblclick" src docs
rg -n "TODO|FIXME|hack|any|as unknown|ts-ignore|eslint-disable|throw new Error|console\\." src docs
```

Search findings:

- Engine listener and observer ownership is centralized in `CanvasEngine`.
- No source keyboard handlers exist.
- `touch-action: none` is set on the canvas.
- No source TODO/FIXME/hack/suppression markers were found.
- The only source `throw new Error` remains the 2D canvas context constructor failure path.

## Final Recommendation

Proceed with the next narrow product-layer step, but do not call the foundation perfect.

Before broadening the product surface, promote `docs/canvas-foundation-devtools-probe.js` into an automated `npm`/CI browser test or replace it with a focused Playwright suite. Before adding complex canvas objects, define the keyboard and nonvisual accessibility model. The current foundation is now stronger for mouse, touch single-pointer, culling, DPR, lifecycle cleanup, and callback boundaries, but the remaining gaps are real enough to track explicitly.
