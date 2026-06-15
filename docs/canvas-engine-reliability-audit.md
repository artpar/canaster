# Canway Canvas Engine Reliability Audit

Date: 2026-06-14

Current status note, 2026-06-15: drag/resize internals in this historical audit have been superseded by `executeCommand` command planning and concrete `CanvasOperation` application. Pointer preview is now render-only geometry derived from the same command plan; committed model mutation remains inside `executeCommand`. The current checked-in regression harness is `npm run probe:canvas`.

## Summary Verdict

The current canvas foundation is reliable enough to build the next layer on after one small model-change boundary fix made during this audit. The verified foundation supports high-DPI rendering, fit/reset/zoom controls, wheel zoom with cursor anchoring, node selection, drag, resize, interruption rollback, viewport culling, theme redraw, React model-change handoff, and coalesced status updates.

No larger product-direction issues were confirmed. The remaining risks are test-coverage and scale risks, not blockers for the current foundation.

## Confirmed Issues Fixed

### Selection Emitted a Model Change

Severity: medium

Static inspection found that selecting a non-front node could reorder the model and emit `node-z-order`, even though the audit invariant requires hover, selection, pan, zoom, and canceled interactions to avoid model changes.

Fix:

- Removed node z-order mutation from node pointer-down. Selection now sets `selectedNodeId` and creates a drag candidate without changing node order.
- Removed the unused `node-z-order` model-change variant so the typed API only exposes committed geometry changes.

Source evidence:

- Node pointer-down now only records selection and original geometry: `src/engine/CanvasEngine.ts:300`
- Commit boundary now emits only `node-move` or `node-resize`: `src/engine/CanvasEngine.ts:472`
- Model-change type now contains only `node-move` and `node-resize`: `src/engine/types.ts:26`

Runtime verification:

- Clicked `source` node center after clean page load.
- Status readout: `Selected source ... No model changes`.
- Result: selection no longer emits a model change.

## Confirmed Issues Not Fixed

None.

## State Ownership Map

React owns:

- `model`, `lastModelChange`, `theme`, and viewport `status` in `src/App.tsx:22`.
- Engine lifecycle and model/theme handoff through effects in `src/App.tsx:27`, `src/App.tsx:48`, and `src/App.tsx:52`.

Engine owns:

- Private cloned model, theme, camera, selection, hover, cursor world point, drag state, DPR, viewport size, dirty/render-frame state, status-frame state, and render counters in `src/engine/CanvasEngine.ts:61`.

DOM/canvas owns:

- Canvas bitmap dimensions and `data-dpr` in `src/engine/CanvasEngine.ts:154`.
- Culling counters in `data-rendered-nodes` and `data-total-nodes` in `src/engine/CanvasEngine.ts:195`.
- Status display text in `src/App.tsx:92`.

Commit and rollback boundaries:

- `setModel` clones React-owned model into the engine and can preserve valid selection/hover across committed model updates: `src/engine/CanvasEngine.ts:115`.
- Drag/resize previews store render-only geometry derived from the command plan; pointer-up clears preview geometry and commits through `executeCommand`.
- Pointer cancel, lost capture, and window blur clear render-only preview geometry or roll back pan camera state.

## Render Invariants

Verified by static inspection and browser probes:

- High-DPI sizing caps DPR at 2 and writes bitmap size from CSS size times DPR: `src/engine/CanvasEngine.ts:154`.
- Grid is drawn in screen space with DPR and camera scale included: `src/engine/CanvasEngine.ts:201`.
- Nodes, labels, detail text, kind labels, selection strokes, and resize handles are drawn in world coordinates under the camera transform: `src/engine/CanvasEngine.ts:187` and `src/engine/CanvasEngine.ts:229`.
- Visible-world bounds include a screen-space culling margin converted to world units: `src/engine/CanvasEngine.ts:453`.

## Runtime Evidence

Commands:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Results:

- `npm run build`: passed.
- `npm audit --omit=dev`: `found 0 vulnerabilities`.
- Dev server: `http://localhost:5173/`.

Browser/runtime probes were run in Chrome against the Vite dev server.

| Probe | Evidence | Result |
| --- | --- | --- |
| Nonblank high-DPI canvas | CSS size `1280x900`, bitmap size `2560x1800`, `data-dpr=2`, sampled color count `4` | Pass |
| Fit view renders all sample nodes | Canvas dataset `4/4`, status `Drawn 4/4`, zoom `122%` | Pass |
| Wheel zoom keeps cursor anchor stable | Cursor anchor at screen `{x:742,y:423}` reported world `{x:189,y:2}` before and after wheel; zoom changed `122% -> 180%` | Pass |
| Selection emits no model change | Clicked `source`; status ended with `No model changes` | Pass |
| Drag commit emits exactly one model change | Mutation-observed last-line values: `No model changes -> node-move source` | Pass |
| Resize commit emits exactly one model change | Mutation-observed last-line values: `node-move source -> node-resize source` | Pass |
| Canceled drag rolls back visible position | After pointercancel, click at moved-only point produced `No selection`; click original point produced `Selected source`; last model-change line stayed `node-resize source` | Pass |
| Canceled resize rolls back visible size | After pointercancel, enlarged-only point produced `No selection`; original point produced `Selected source`; last line stayed `No model changes` in isolated probe | Pass |
| Background pan cancel rolls back camera | Same screen point reported rounded world `{x:-198,y:42}` before and after cancel; last model-change line unchanged | Pass |
| Window blur during drag rolls back | After blur, moved-only point produced `No selection`; original point produced `Selected source`; last line unchanged | Pass |
| Window blur during resize rolls back | Isolated resize probe: enlarged-only point produced `No selection`; original point produced `Selected source`; last line stayed `No model changes` | Pass |
| Window blur during pan rolls back camera | Same screen point reported rounded world `{x:-198,y:42}` before and after blur; last model-change line unchanged | Pass |
| Lost pointer capture rolls back drag | After lost capture, moved-only point produced `No selection`; original point produced `Selected source`; last line unchanged | Pass |
| Panning far away triggers culling | Dataset/status reported `Drawn 0/4` | Pass |
| Theme toggle redraws and controls remain usable | Sample pixel changed `[16,18,23,255] -> [244,246,248,255]`, root theme `light`, theme button label changed to `Switch to dark theme`, zoom control still updated readout | Pass |

Console/network:

- Network requests during probes all returned HTTP 200.
- No app errors were logged.
- Console entries were Vite connection/debug messages, React DevTools informational messages, and one Canvas2D readback warning caused by the audit probe's repeated `getImageData` calls.

## Residual Risks

- The interruption checks are now covered by the checked-in Chrome/CDP probe run through `npm run probe:canvas`; keep extending that harness as interaction complexity grows.
- Culling was verified with the sample model and a far pan to `0/4`; very large graphs may need separate stress/performance profiling.
- Pointer drag/resize now previews through render-only geometry from command planning before pointer-up commit. Future undo/redo or collaboration work should extend the operation model rather than reintroducing direct geometry mutation paths.

## Completion Criteria Audit

- `docs/canvas-engine-reliability-audit.md` exists and is evidence-backed: complete.
- All small confirmed foundation bugs found during the audit are fixed: complete; selection no longer emits model changes.
- `npm run build` passes: complete.
- `npm audit --omit=dev` reports no vulnerabilities: complete.
- Browser/runtime probes cover the required evidence list: complete.
- Report distinguishes proven facts from residual risks: complete.
