# Product-Complete Remaining Dents Report

Date: 2026-06-15

## Executive Verdict

Verdict: **reliable enough**.

The current Canway frontend/canvas foundation is reliable enough for the next product-layer step, but it is not perfect and not product-complete. The core correctness and reliability gates passed again after this audit, but product-completeness still has real gaps: no nonvisual node/object model, no canvas keyboard editing semantics, unsupported multi-touch gestures, limited browser/device coverage, and a confirmed frame-time/performance dent when all 1,000-2,000 nodes are rendered in one fitted viewport.

The verdict is not overstated because every pass below is scoped to the current generic canvas foundation. It does not prove product-complete accessibility, real-device touch behavior, cross-browser parity, full performance budgets, persistence, export, routing, collaboration, or domain semantics.

## Worktree Context

This directory is not a git repository:

```bash
git status --short --branch
fatal: not a git repository (or any of the parent directories): .git
```

Evidence in this report comes from the current file tree, command output, and live browser/runtime state.

## Changes Made In This Pass

### Fixed: Probe Browser Path Was Hardcoded

Severity: low automation/CI portability issue.

Evidence:

- Before this pass, `scripts/run-canvas-foundation-probe.mjs` hardcoded Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

Fix:

- Added `CANWAY_CHROME_PATH` / `CHROME_PATH` support with the macOS path as default: `scripts/run-canvas-foundation-probe.mjs:7-8`.
- Improved the missing-browser error to name the env vars: `scripts/run-canvas-foundation-probe.mjs:239-243`.

Verification:

- `npm run probe:canvas` passed and exited cleanly after the change.

### Fixed: No Current Docs Index

Severity: low operational clarity issue.

Evidence:

- `docs/` contained many historical reports and goal prompts, but no “read this first” status index.

Fix:

- Added `docs/README.md` with current verdict, authoritative report order, generated-artifact boundaries, out-of-scope areas, local gates, and Chrome env-var note.

Verification:

- `docs/README.md:1-25` exists and points readers to the latest reports.

## Required Commands

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
- built in `480ms`

```bash
npm audit --omit=dev
```

Passed: `found 0 vulnerabilities`.

```bash
npm run probe:canvas
```

Passed and exited cleanly. Output captured at `/tmp/canway-product-complete-probe.txt`.

Important probe evidence:

- app canvas: CSS `756x469`, bitmap `756x469`, DPR `1`, rendered `4/4`, `tabIndex: -1`.
- sequential focusables: `Fit view`, `Reset zoom`, `Zoom out`, `Zoom in`, `Switch to light theme`; no canvas.
- model boundary deltas: hover `0`, selection `0`, zero-delta drag `0`, real drag `1`, zero-delta resize `0`, real resize `1`, wheel `0`, double-click `0`, theme `0`, canvas resize `0`.
- cancellation/lost capture: node, resize, and pan rollback all `modelChangeDelta: 0`, `rolledBack: true`.
- multi-touch policy: second touch pointer ignored; active touch drag emitted one `node-move`; active resize emitted one `node-resize`; active pan emitted no model changes.
- churn: 60 cycles, `modelCallbackCount: 120`, expected `120`, listener balances all `0`.
- future model shape: 1,000 nodes and 2,000 nodes rendered coherently with zero model callbacks and no captured errors.

## Source Search Findings

Source-owned inventory excludes `node_modules/` and `dist/`.

Key ownership evidence:

- React owns app state, engine lifecycle, toolbar actions, and status rendering in `src/App.tsx:58-121`.
- Canvas engine owns DPR sizing, render counters, listeners, pointer handling, rollback, model callbacks, and status callbacks in `src/engine/CanvasEngine.ts`.
- Model shape is generic only: `CanvasNode` has `id`, `label`, `detail`, `kind`, `x`, `y`, `w`, and `h` in `src/engine/types.ts:11-24`.
- `CanvasEngine` sets `tabIndex = -1` in `src/engine/CanvasEngine.ts:88`.
- Listener cleanup is paired in `src/engine/CanvasEngine.ts:102-113`.
- DPR cap/bitmap sizing is in `src/engine/CanvasEngine.ts:155-163`.
- Render counters are written in `src/engine/CanvasEngine.ts:196-198`.
- Wrong pointer ids are ignored in `src/engine/CanvasEngine.ts:337-343` and `src/engine/CanvasEngine.ts:487-493`.
- Model changes emit only for changed node move/resize in `src/engine/CanvasEngine.ts:495-499`.
- `src` has no TODO/FIXME/hack/suppression markers.
- `console.log`/`console.error` exist only in the CLI probe runner, not app runtime source.
- No backend, database, auth, persistence, router, collaboration, or export implementation exists in `src`, `scripts`, or `package.json`. Matches are docs, probe helper server/free-port code, exported TypeScript types, and sample text.

## Browser Runtime Evidence

Live server:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Passed: Vite ready in `264ms`, inspected at `http://127.0.0.1:5179/`.

Desktop `1280x900`, DPR `2`:

- canvas CSS `1280x900`
- bitmap `2560x1800`
- `data-dpr: "2"`
- rendered/total `4/4`
- canvas `tabIndex: -1`
- statusbar `role="status"`, `aria-live="polite"`
- topbar/statusbar overlap: `false`
- focusable controls: five toolbar buttons only

Accessibility snapshot:

- `Canvas "Canway canvas"`
- named toolbar buttons
- `status atomic live="polite"`

Direct Tab sequence:

- first Tab focused `Fit view`
- second Tab focused `Reset zoom`
- canvas was skipped

Mobile/high-DPR emulation `390x844x3`:

- browser DPR `3`
- engine-capped DPR `2`
- canvas CSS `390x844`
- bitmap `780x1688`
- rendered/total `4/4`
- topbar within viewport
- statusbar within viewport
- buttons within viewport
- topbar/statusbar overlap: `false`

Screenshots captured:

- `/tmp/canway-product-desktop-dark-selected-after.png`
- `/tmp/canway-product-mobile-dark.png`
- `/tmp/canway-product-mobile-light.png`

## Console And Network

Console after desktop/mobile/stress checks showed only expected development messages:

- `[vite] connecting...`
- `[vite] connected.`
- React DevTools development info message

Network requests returned `200` or cache `304` for expected Vite app/module requests:

- `/`
- `@vite/client`
- `src/main.tsx`
- `@react-refresh`
- React deps
- `src/App.tsx`
- `src/styles.css`
- `src/engine/CanvasEngine.ts`
- `src/engine/sampleModel.ts`
- `src/engine/theme.ts`

No unexpected failed request was observed.

## Extra Stress And Performance Evidence

Functional app-level stress passed:

- 100 toolbar interactions.
- 100 wheel bursts.
- 100 node selection/drag/resize attempts:
  - 100 move commits
  - 80 resize commits
  - 20 canceled resize attempts
- 100 theme toggles.
- unsupported canvas key dispatch for arrows, `+`, `-`, `Enter`, `Escape`, and `Space`.
- final canvas stayed coherent: CSS `1280x900`, bitmap `2560x1800`, DPR `2`, rendered/total `4/4`.
- no captured runtime errors.

Performance/frame-window probe:

- Isolated 1,000-node fitted viewport:
  - rendered/total `1000/1000`
  - `maxFrameMs: 699`
  - `avgFrameMs: 43.2`
  - no errors
- Isolated 2,000-node fitted viewport:
  - rendered/total `2000/2000`
  - `maxFrameMs: 1995.8`
  - `avgFrameMs: 109.7`
  - no errors

Interpretation:

- Correctness and culling counters remain coherent.
- Product-complete performance is not proven. Rendering every node with text in one fitted viewport can produce frame delays far beyond a smooth interaction budget.
- This is not a small correctness bug. It needs a product performance task: profiling, rendering budget, level-of-detail/text virtualization, viewport strategy, or canvas batching decisions.

## Category Classification

| Area | Classification | Evidence |
| --- | --- | --- |
| Canvas correctness foundation | not found | Build and `probe:canvas` passed; model-change boundaries and rollback verified. |
| Accessibility and nonvisual model | confirmed issue | Snapshot exposes a single canvas, toolbar buttons, and live status, not structured nodes. |
| Statusbar usefulness/noise | risk | Current status is concise enough for foundation, but product-complete nonvisual workflows need object-level semantics beyond live text. |
| Keyboard policy | intentional decision | Canvas skipped in Tab order; toolbar is keyboard surface; no fake shortcuts. |
| Product keyboard editing | confirmed issue | No semantics for arrow move, resize-by-key, delete, copy/paste, Enter/Space activation, or Escape cancel. |
| Pointer/touch reliability | not found for single pointer | Probe and stress verified drag/resize/pan, wrong ids, cancel/lost capture, and blur rollback. |
| Multi-touch gestures | intentional decision / product gap | Unsupported; unrelated second pointers ignored safely. Pinch/two-finger pan would require new gesture state. |
| Real-device touch | risk | Mobile/touch emulation passed; real hardware not tested. |
| Rendering scale correctness | not found | DPR/culling/model-shape checks passed. |
| Rendering performance | confirmed issue | 1k/2k fitted-node frame-window checks showed large frame delays. |
| Automation determinism | not found | `npm run probe:canvas` passed and exited cleanly. |
| CI browser portability | fixed / residual risk | Chrome path now env-configurable; CI still must provision compatible Chrome/Chromium. |
| Docs clarity | fixed | Added `docs/README.md` current-status index. |
| Historical docs | risk | Historical reports remain and can be stale if read directly. README now warns about that. |
| Product scope boundaries | intentional decision | Persistence/export/routing/collaboration/domain semantics absent and should remain product-layer tasks. |
| Backend/database/ER analysis | out of scope | No backend/database/auth/app server code exists in the repo. |

## Confirmed Issues Not Fixed

### Medium: No Nonvisual Node/Object Model

Evidence:

- Browser accessibility snapshot exposes `Canvas "Canway canvas"` but no structured nodes.
- Current model shape is generic geometry/text only in `src/engine/types.ts:11-24`.

Impact:

- Fine for a visual canvas foundation.
- Not product-complete for screen-reader inspection or manipulation of nodes.

Next task:

- Define product object semantics, then add a derived nonvisual object model and matching operations.

### Medium: No Canvas Keyboard Editing Semantics

Evidence:

- Canvas is intentionally skipped in normal Tab order.
- Unsupported keyboard events do not mutate model state.
- There are no product semantics for node activation, move, resize, delete, copy/paste, or cancel.

Impact:

- Correct for the current foundation policy.
- Not complete for an editor-like product.

Next task:

- Define keyboard interaction model after product object semantics exist.

### Medium: Rendering All 1,000-2,000 Nodes Can Jank

Evidence:

- 1,000 fitted nodes: max frame delta `699ms`, average `43.2ms`.
- 2,000 fitted nodes: max frame delta `1995.8ms`, average `109.7ms`.
- Both rendered coherently, but not smoothly.

Impact:

- Correctness is okay, but performance is not product-complete for large visible graphs.

Next task:

- Add a performance budget and profile rendering. Consider level-of-detail, text drawing reduction, batching, viewport strategy, richer culling, or product constraints.

### Low: Cross-Browser And Real-Device Coverage Missing

Evidence:

- Current automation uses Chrome/CDP.
- Live testing used Chrome DevTools and emulation.

Impact:

- Safari, Firefox, and real touch hardware could expose event, DPR, text rendering, or touch behavior differences.

Next task:

- Add cross-browser/device test plan before claiming product-complete reliability.

## Intentional Product Decisions

- Canvas is not in normal Tab order.
- Toolbar buttons are the current keyboard-operable controls.
- No `aria-keyshortcuts` are advertised because no canvas shortcuts exist.
- Multi-touch gestures are unsupported and unrelated pointers are ignored.
- The foundation does not implement persistence, export, routing, collaboration, domain semantics, backend APIs, database schema, or ER diagrams.

## Out Of Scope

ER diagrams, database schema, backend API, auth, persistence architecture, routing, collaboration, and export implementation are out of scope for this repo right now. The current codebase is a React/Vite frontend canvas foundation with a local browser probe runner.

## Residual Risks

- Product accessibility requires product-level object semantics.
- Product keyboard editing requires a real command/selection model.
- Real-device touch and non-Chrome browser behavior remain unverified.
- CI must provision Chrome/Chromium and set `CANWAY_CHROME_PATH` or `CHROME_PATH` if the default macOS Chrome path is unavailable.
- Large visible node counts need performance profiling and optimization before product-scale claims.
- Historical docs remain in the repo; `docs/README.md` now reduces but does not remove the risk of stale-doc misreads.

## Final Recommendation

Keep building on this foundation, but do not call it perfect or product-complete. The next responsible product-level tasks are:

1. Define the product object/accessibility model.
2. Define keyboard editing commands.
3. Add a rendering performance budget and profiling gate.
4. Add CI browser provisioning using the configurable Chrome path.
5. Add cross-browser and real-device touch coverage when the product interaction model is clearer.
