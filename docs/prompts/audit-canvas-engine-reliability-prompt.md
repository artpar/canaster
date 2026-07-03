# Prompt: Audit Canway Canvas Engine Reliability Issues

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to systematically find reliability issues in the current canvas engine, especially issues like state divergence, interrupted input bugs, render inconsistencies, lifecycle leaks, and hidden edge cases that are not obvious from the happy path.

Do not implement a new feature. This is an audit and hardening investigation. If you find a confirmed issue that is small and clearly within the current engine foundation, fix it and verify the fix. If an issue is larger or changes product direction, document it with evidence and a recommended next task.

## Starting Point

Key files:

- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/App.tsx`
- `src/engine/sampleModel.ts`
- `src/styles.css`
- `docs/prompts/fix-canvas-engine-foundation-prompt.md`

The engine currently supports high-DPI canvas rendering, grid, fit/reset/zoom controls, pan, wheel zoom, node selection, drag, resize, culling counters, theme toggle, pointer cancellation cleanup, and `onModelChange` events for committed model changes.

## Audit Strategy

Work from evidence. Do not assume the engine is correct because build passes or the UI looks fine.

1. Build a state ownership map.
   - Identify every mutable state owner: React state, engine model, camera, drag state, hover/selection, DOM dataset/debug status, canvas pixels.
   - Identify every state transition: set model, theme change, fit, zoom, pan, select, drag, resize, pointer-up commit, pointer-cancel rollback, lost capture, blur, unmount.
   - For each transition, state what must be committed, rolled back, or left transient.

2. Build an input lifecycle matrix.
   - Cover pointer down, move, up, cancel, lost capture, window blur, wheel, double-click, toolbar clicks, resize observer, and component unmount.
   - Test both node and background interactions.
   - Include interrupted flows: down -> move -> cancel, down -> move -> blur, down -> move -> lostpointercapture, down -> unmount.

3. Build render invariants.
   - Text and geometry must scale consistently under camera transforms.
   - Selection and resize handles must stay attached to their nodes.
   - Viewport culling must skip offscreen nodes but not incorrectly skip visible nodes.
   - High-DPI sizing must match CSS size times capped DPR.
   - Theme changes must redraw all visible content without stale colors.

4. Build model-change invariants.
   - Hover, selection, pan, zoom, and canceled interactions must not emit model changes.
   - Node drag/resize must emit exactly one committed model change on successful pointer-up.
   - The model snapshot emitted to React must match the final visible canvas state.
   - React re-render after `onModelChange` must not lose selection unexpectedly or overwrite committed changes with stale state.

5. Build performance and lifecycle checks.
   - Status updates should be coalesced and not emit unbounded React updates on pointer move.
   - Event listeners must be removed on dispose.
   - Pending animation frames must not update disposed components.
   - Culling must report fewer rendered nodes when the viewport is panned away from all nodes.

## Required Evidence

Use both static source inspection and browser/runtime probes.

Run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Use browser devtools or Playwright-style scripts to verify at least:

- Nonblank high-DPI canvas.
- Fit view renders all sample nodes.
- Wheel zoom changes zoom while keeping the cursor anchor stable.
- Drag commit emits `node-move`.
- Resize commit emits `node-resize`.
- Canceled drag rolls back visible position and emits no model change.
- Canceled resize rolls back visible size and emits no model change.
- Background pan cancel rolls back camera position.
- Window blur during drag/resize/pan clears active drag state and rolls back transient state.
- Lost pointer capture clears active drag state and rolls back transient state.
- Panning far away causes culling counters to show fewer rendered nodes, ideally `0/total`.
- Theme toggle changes rendered colors and keeps controls usable.
- Console has no unexpected errors or failed resource requests.

For each runtime probe, record:

- What interaction was simulated.
- What observable value proves the result: status text, canvas dataset, pixel sample, console output, or model-change event.
- Whether the evidence proves success, failure, or uncertainty.

## Output

Create or update a report at:

`docs/history/canvas-engine-reliability-audit.md`

The report must include:

- Summary verdict: whether the current foundation is reliable enough to build the next layer on.
- Confirmed issues fixed in this audit, with file references and verification evidence.
- Confirmed issues not fixed, with severity and recommended next task.
- Areas tested and evidence collected.
- Residual risks and why they are not blocking the current foundation.

If you change code, keep the changes focused on reliability fixes in the current foundation. Do not add parsers, domain-specific objects, semantic connection systems, layout engines, export, annotations, save/load, or a heavy third-party canvas replacement.

## Completion Criteria

The task is complete only when:

- `docs/history/canvas-engine-reliability-audit.md` exists and is evidence-backed.
- All small confirmed foundation bugs found during the audit are fixed.
- `npm run build` passes.
- `npm audit --omit=dev` reports no vulnerabilities.
- Browser/runtime probes cover the required evidence list above.
- The final report clearly distinguishes proven facts from residual risks.
