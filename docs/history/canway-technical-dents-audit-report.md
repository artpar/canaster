# Canway Technical Dents Audit Report

Date: 2026-06-15

## Executive Verdict

Verdict: **reliable enough**.

The current Canway frontend/canvas foundation is not perfect, but the core foundation is behaving reliably under the current scope. Build, audit, automated browser probe, live desktop and mobile runtime checks, console/network inspection, high-DPR emulation, keyboard tab checks, and additional stress loops all passed.

The verdict is not stronger because several meaningful product/foundation risks remain: the canvas has no nonvisual node/object model, multi-touch gestures are intentionally unsupported, CI portability depends on browser provisioning, and older historical reports can be misleading if read without the latest report context.

## Worktree Context

This directory is not a git repository:

```bash
git status --short --branch
fatal: not a git repository (or any of the parent directories): .git
```

Current evidence is therefore based on the live file tree, command output, and browser runtime state, not a commit hash.

## Source Inventory

Source-owned files, excluding `node_modules` and `dist`:

- `src/App.tsx`, `src/main.tsx`, `src/styles.css`
- `src/engine/CanvasEngine.ts`, `src/engine/types.ts`, `src/engine/sampleModel.ts`, `src/engine/theme.ts`
- `scripts/run-canvas-foundation-probe.mjs`
- `docs/*.md`, `docs/canvas-foundation-devtools-probe.js`
- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`

Runtime ownership:

- React owns committed UI state and engine lifecycle in `src/App.tsx:20-55`.
- The canvas engine owns transient camera, model clone, drag state, listeners, DPR sizing, rendering, hit testing, and callback emission in `src/engine/CanvasEngine.ts`.
- The model is deliberately small and generic: nodes only have `id`, `label`, `detail`, `kind`, `x`, `y`, `w`, and `h` in `src/engine/types.ts:11-24`.
- Package scripts are `dev`, `build`, `preview`, and `probe:canvas` in `package.json:6-10`.

## Commands Run

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
- built in `189ms`

```bash
npm audit --omit=dev
```

Passed: `found 0 vulnerabilities`.

```bash
npm run probe:canvas
```

Passed and exited cleanly. Output was captured at `/tmp/canway-technical-dents-probe.txt`.

Important probe evidence:

- app canvas: CSS `756x469`, bitmap `756x469`, DPR `1`, rendered `4/4`, `tabIndex: -1`.
- model boundary deltas: hover `0`, selection `0`, zero-delta drag `0`, real drag `1`, zero-delta resize `0`, real resize `1`, wheel `0`, double-click `0`, theme `0`, canvas resize `0`.
- cancellation and lost capture: node, resize, and pan paths all rolled back with `modelChangeDelta: 0`.
- multi-touch policy: unrelated second touch pointer ignored; active node drag emitted one `node-move`; active resize emitted one `node-resize`; touch pan emitted no model changes.
- churn: 60 cycles, `modelCallbackCount: 120`, expected `120`, listener balances all `0`.
- future model shapes: 1,000 nodes, 2,000 nodes, dense overlap, extreme coordinates, min-size, wide/tall, long text, mixed near/far, and unusual valid ids/labels all had coherent culling, zero model callbacks, and no errors.

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Passed: Vite ready in `96 ms`; live URL used for browser inspection was `http://127.0.0.1:5179/`.

## Browser Runtime Evidence

Desktop viewport `1280x900`, DPR `2`:

- canvas CSS `1280x900`
- canvas bitmap `2560x1800`
- `data-dpr: "2"`
- `data-rendered-nodes: "4"`
- `data-total-nodes: "4"`
- `tabIndex: -1`
- statusbar `role="status"` and `aria-live="polite"`
- focusable controls: `Fit view`, `Reset zoom`, `Zoom out`, `Zoom in`, `Switch to light theme`
- topbar and statusbar did not overlap

Accessibility snapshot showed:

- `Canvas "Canway canvas"`
- five named toolbar buttons
- `status atomic live="polite"`

Mobile/high-DPR emulation `390x844x3`:

- browser DPR `3`
- engine-capped canvas DPR `2`
- canvas CSS `390x844`
- canvas bitmap `780x1688`
- rendered/total `4/4`
- topbar within viewport
- statusbar within viewport
- all buttons within viewport
- topbar/statusbar overlap: `false`

Screenshots saved:

- `/tmp/canway-mobile-light.png`
- `/tmp/canway-desktop-dark-selected.png`

## Console And Network

Console after desktop/mobile/stress checks contained only expected development messages:

- `[vite] connecting...`
- `[vite] connected.`
- React DevTools development info message

Network requests after live inspection returned `200` or cache `304` for the expected Vite app/modules:

- `/`
- `@vite/client`
- `src/main.tsx`
- `@react-refresh`
- React dependencies
- `src/App.tsx`
- `src/styles.css`
- `src/engine/CanvasEngine.ts`
- `src/engine/sampleModel.ts`
- `src/engine/theme.ts`

No unexpected failed request was observed.

## Source Search Findings

Searches run:

```bash
rg --files
rg --files -g '!node_modules/**' -g '!dist/**'
rg -n "CanvasEngine|setModel|onModelChange|onStatus|sampleModel|ViewportStatus|CanvasModel|CanvasNode" src docs scripts package.json
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|PointerEvent|WheelEvent|KeyboardEvent" src docs scripts
rg -n "tabIndex|aria-|role=|focus|blur|statusbar|button|canvas|touch-action|pointerType|pointerId|lostpointercapture|pointercancel|wheel|dblclick" src docs scripts
rg -n "TODO|FIXME|hack|ts-ignore|eslint-disable|as unknown|any|throw new Error|console\\." src docs scripts
rg -n "express|server|api|database|sqlite|postgres|schema|auth|fetch|localStorage|indexedDB|ER diagram|entity relationship" src scripts package.json docs/history/historical-task-briefs.md
```

Findings:

- Event listener ownership is centralized in `CanvasEngine`.
- Listener cleanup is paired in `dispose()` at `src/engine/CanvasEngine.ts:102-113`.
- DPR sizing is capped and written to dataset in `src/engine/CanvasEngine.ts:155-163`.
- Render counters are written in `src/engine/CanvasEngine.ts:196-198`.
- Pointer owner checks happen in `src/engine/CanvasEngine.ts:337-343` and `src/engine/CanvasEngine.ts:487-493`.
- Model callbacks only emit in `finishPointerInteraction()` for changed node move/resize in `src/engine/CanvasEngine.ts:495-499`.
- React state handoff uses `setModel(..., { preserveInteraction: true })` in `src/App.tsx:48-50`.
- `src` contains no TODO/FIXME/hack/suppression markers.
- The only source `throw new Error` is the expected missing 2D canvas context guard at `src/engine/CanvasEngine.ts:80`.
- `console.log`/`console.error` are only in the CLI probe runner, not app runtime source.
- No backend/auth/database/persistence code was found in `src`, `scripts`, or `package.json`.

## Category Classification

| Category | Classification | Evidence |
| --- | --- | --- |
| Runtime entry and ownership | not found | React entry and engine ownership are clear in `src/App.tsx` and `src/engine/CanvasEngine.ts`. |
| Model-change correctness | not found | `npm run probe:canvas` proved only real drag/resize emit model changes. |
| Zero-delta boundaries | not found | Probe deltas for zero-delta drag/resize were `0`. |
| Cancellation/lost capture | not found | Probe showed node, resize, and pan rollback with `modelChangeDelta: 0`. |
| React re-handoff | not found | App stress kept rendered/total `4/4`; source shows preserve-interaction handoff. |
| Cloned model boundaries | not found | `setModel` clones nodes and emitted snapshots are cloned. |
| Pointer capture/release | not found | Probe listener balances `0`; wrong pointer ids ignored. |
| Multi-touch gestures | intentional | Unsupported by policy; unrelated touch pointers are ignored safely. |
| Wheel/double-click bounds | not found | Probe and 100 wheel burst kept canvas coherent. |
| Toolbar/canvas conflict | not found | 100 toolbar interactions and app stress produced no runtime errors. |
| Touch behavior | not found | `touch-action: none` at `src/styles.css:53-59`; mobile/touch emulation passed. |
| DPR and bitmap sizing | not found | Desktop DPR 2 and mobile DPR 3 capped to 2 were coherent. |
| Culling and model-shape stress | not found | Probe covered edge/offscreen, 1k/2k nodes, dense, far, min, wide/tall, long text, unusual labels. |
| Narrow layout | not found | Mobile topbar/statusbar/buttons stayed within viewport and did not overlap. |
| Theme redraw | not found | 100 theme toggles ended in coherent dark state; mobile light state rendered `4/4`. |
| Keyboard contract | intentional | Canvas is not in Tab order and has no shortcuts; toolbar is keyboard surface. |
| Toolbar accessibility | not found | Buttons have names and focus visibility source rules. |
| Status live region | not found | Runtime and probe show `role=status`, `aria-live=polite`. |
| Nonvisual canvas content | confirmed residual issue | Canvas exposes no structured node list or object semantics. |
| Probe determinism | not found | `npm run probe:canvas` passed and exited cleanly. |
| CI portability | risk | Probe depends on Chrome path unless CI provides compatible Chrome or config. |
| Stale historical docs | risk | Older reports contain historical findings; latest reports supersede them but there is no docs index. |
| Dependencies | not found | Only React, React DOM, lucide-react runtime dependencies; audit clean. |
| Backend/ER/database | out of scope | No such app/backend source exists in this repo. |

## Additional Stress Beyond Existing Probe

Live app stress, desktop DPR 2:

- 100 app-level toolbar interactions: no errors, render counters stayed coherent.
- 100 wheel bursts: no errors, rendered/total stayed `4/4`.
- 100 pointer attempts on background/no-change path: no model change, rendered/total stayed `4/4`.
- 100 actual sample-node selection/drag/resize iterations after Fit View:
  - 100 move commits
  - 80 resize commits
  - 20 canceled resize attempts
  - final status `Selected source ... node-resize source`
  - rendered/total `4/4`
  - no captured runtime errors
- 100 theme toggles: ended at `dark`, button label `Switch to light theme`, rendered/total `4/4`.
- Canvas keyboard dispatch for arrow keys, `+`, `-`, `Enter`, `Escape`, and `Space`: no model change.
- Direct Tab sequence: first Tab focused `Fit view`; second Tab focused `Reset zoom`; canvas skipped.
- Mobile/high-DPR emulation: covered `390x844x3`, capped engine DPR to `2`.

Existing automated probe still covers repeated isolated engine construction/dispose, listener balance, model-shape stress, cancellation/lost capture, and multi-touch policy.

## Confirmed Issues Fixed In This Pass

None. No new small generic foundation bug was confirmed during this audit.

## Confirmed Issues Not Fixed

### Medium: Canvas Content Has No Nonvisual Node/Object Model

Evidence:

- Accessibility snapshot exposes a labeled canvas, toolbar buttons, and live status.
- It does not expose individual nodes as list items, tree items, selectable objects, or another structured nonvisual model.
- The current source model only defines generic node fields in `src/engine/types.ts:11-24`; it does not define product semantics for activation, ordering, editing, relationships, or keyboard manipulation.

Impact:

- Acceptable for this generic visual foundation.
- Not sufficient for a product-complete accessible editor.

Next task:

- Once product object semantics exist, add a derived nonvisual representation and matching keyboard operations. Do not invent fake semantics in the generic canvas layer.

## Intentional Product Decisions

- Canvas is not in sequential Tab order: `src/engine/CanvasEngine.ts:88`.
- Canvas remains programmatically focusable after pointer interaction: `src/engine/CanvasEngine.ts:283-285`.
- Toolbar buttons are the current keyboard-operable surface: `src/App.tsx:67-88`.
- No `aria-keyshortcuts` are advertised because no canvas shortcuts exist.
- Multi-touch pinch/rotate/two-finger pan is unsupported; unrelated touch pointers are ignored.
- Persistence, export, routing, collaboration, semantic edges, parsers, and domain object systems are not part of this foundation.

## Residual Risks

- CI portability: `scripts/run-canvas-foundation-probe.mjs` expects Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. CI needs a compatible browser path or configurable browser provisioning.
- Browser/device coverage: Chrome/CDP and emulated mobile/high-DPR were checked; Safari, Firefox, and real touch hardware were not.
- Accessibility completeness: nonvisual node/object inspection and manipulation remain product-layer work.
- Performance profiling: the probe checks correctness, culling coherence, and obvious runtime failure. It is not a frame-time profiler.
- Historical docs: older reports are useful audit history but can describe previous behavior, such as pre-automation or pre-keyboard-policy gaps. Treat this report and `docs/history/canvas-foundation-gap-closure-report.md` as current.

## Out Of Scope

ER diagram, database schema, backend API, persistence, auth, and server architecture analysis are out of scope because the repo contains no such application code. The only `server` match is the local probe helper creating a temporary TCP server to choose a free port.

## Final Recommendation

Use the current foundation for the next product-layer step. Keep `npm run build`, `npm audit --omit=dev`, and `npm run probe:canvas` as the local gate. Do not call the app perfect until the product-specific nonvisual object model, real keyboard semantics, CI browser provisioning, and broader browser/device coverage are implemented and verified.
