# Prompt: Harden the Canway Canvas Engine Foundation

You are working in `/Users/artpar/workspace/code/canway`.

The current app is a React + Vite + TypeScript canvas foundation. It already has a separate imperative canvas engine, sample nodes, toolbar controls, high-DPI sizing, grid, pan/zoom, selection, drag, resize, themes, and status readout.

Your goal is to fix the real technical dents before any product-specific layer is built on top. Do not add parsers, domain-specific objects, semantic connection systems, layout engines, persistence UI, annotations, or export in this task. Keep the scope focused on making the existing canvas foundation reliable and extensible.

## Current Files To Start From

- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/theme.ts`
- `src/engine/sampleModel.ts`
- `src/App.tsx`
- `src/styles.css`

## Problems To Fix

1. Fix canvas text and geometry scaling.
   - The current renderer sets a world transform and then divides font sizes by `camera.scale`.
   - That makes text behave differently from node geometry at zoom levels.
   - Decide on one consistent rendering model and implement it cleanly.
   - Preferred approach for this foundation: draw node content in world coordinates under the camera transform, so the whole node scales consistently.
   - Ensure labels, body text, kind text, selection strokes, and resize handles remain visually coherent across zoom.

2. Add a real model-change boundary.
   - The engine currently mutates its private cloned model during drag/resize.
   - Add a typed `onModelChange` callback or equivalent transaction hook so React can observe node position/size changes.
   - Keep the engine imperative, but do not make future persistence/undo impossible.
   - Avoid emitting model changes on every hover or every render.
   - Emit changes at sensible commit points, such as after drag/resize completes.

3. Harden pointer lifecycle.
   - Handle `pointercancel`, lost pointer capture, and `window.blur`.
   - Ensure stale drag/resize/pan state cannot remain active if the browser interrupts input.
   - Keep cursor state correct after cancellation.
   - Do not break normal pointer drag behavior.

4. Add a culling boundary.
   - The engine currently draws all nodes on every dirty render.
   - Add viewport/world bounds calculation and skip drawing nodes fully outside the visible area with a small margin.
   - This is enough for this task; do not implement bitmap caching yet unless it remains simple and contained.

5. Reduce unnecessary React churn from status updates.
   - Pointer move currently emits status continuously.
   - Keep the readout responsive, but avoid unbounded React state updates from the engine.
   - A simple `requestAnimationFrame`-coalesced status emitter is acceptable.

6. Preserve the current UX.
   - Existing toolbar controls must still work: fit, reset zoom, zoom in, zoom out, theme toggle.
   - Existing canvas interactions must still work: pan, wheel zoom, node selection, node drag, node resize.
   - Do not introduce a landing page or decorative UI.

## Implementation Requirements

- Keep the canvas engine framework-neutral.
- Keep React responsible for mounting, toolbar commands, sample model ownership, and status display.
- Use TypeScript types for any new callbacks/events.
- Keep changes focused and avoid broad refactors that do not support the fixes above.
- Do not add a heavy third-party canvas replacement.

## Expected Acceptance Criteria

- `npm run build` passes.
- `npm audit --omit=dev` reports no vulnerabilities.
- Manual/browser checks pass:
  - Canvas is nonblank and high-DPI sized.
  - Fit view centers all sample nodes.
  - Wheel zoom keeps the cursor anchor stable.
  - Text and node geometry scale consistently at low and high zoom.
  - Selecting, dragging, and resizing nodes still work.
  - Drag/resize changes are observable by React through the model-change boundary.
  - Releasing pointer outside the canvas, pointer cancellation, and window blur clear active drag state.
  - Theme toggle redraws without stale colors.
  - Offscreen nodes are skipped by the renderer.

## Suggested Verification Commands

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Use browser/devtools verification after starting the dev server. Do not rely only on the production build.

## Out Of Scope

- Product-specific parser
- Product-specific node renderer
- Semantic connection layer
- Dagre layout
- Save/load
- Undo/redo
- PNG/SVG export
- Sticky notes or group boxes
- Multi-user collaboration
