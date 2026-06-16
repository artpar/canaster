# Canway Architecture And Software KT

Date: 2026-06-15

Purpose: this document is the continuity handoff for future Canway development. It captures the live architecture, ownership boundaries, edit contracts, verification gates, and known limits that should guide ongoing work.

## Current Verdict

Canway is reliable enough at the canvas-foundation layer, but it is not product-complete.

What is solid now:

- React/Vite app shell with a custom 2D canvas engine.
- Model-backed nodes rendered on canvas.
- Pointer, keyboard, nonvisual, and future AI edits share the same command planning path.
- Pointer preview is render-only geometry derived from command plans; it does not mutate committed model geometry.
- Pointer group drag preserves multi-selection and moves selected nodes together.
- Checked-in Chrome/CDP probe covers the main engine contracts.

What is not complete:

- No backend, persistence, routing, collaboration, export, auth, or product domain model.
- No ER diagram or database architecture is relevant to this repo today.
- Real-device iOS Safari and Android Chrome touch behavior is still unverified.
- Product-specific accessibility semantics are not defined beyond the current generic node access panel.

## Source Map

Primary authored files:

- `src/App.tsx`: React shell, document loading, toolbar, node access panel, status bar, theme state.
- `src/catalog/service-business-atlas.json`: static starter document used for new local workspaces.
- `src/catalog/starterCatalog.ts`: starter catalog adapter that hydrates static document data for runtime use.
- `src/engine/CanvasEngine.ts`: canvas rendering, camera, selection, command planning, command execution, pointer/keyboard/touch interaction, lifecycle cleanup.
- `src/engine/types.ts`: public model, command, operation, model-change, status, and engine option types.
- `src/engine/theme.ts`: canvas render colors.
- `src/styles.css`: app layout, overlays, toolbar, node access panel, status bar.
- `docs/canvas-foundation-devtools-probe.js`: browser-side probe logic imported by the probe runner.
- `scripts/run-canvas-foundation-probe.mjs`: starts Vite/Chrome CDP, runs the probe, asserts contracts.
- `docs/README.md`: docs entry point and current status index.

Generated or installed output:

- `dist/`: generated build output.
- `node_modules/`: installed dependencies.

Do not treat generated output as source ownership.

## Runtime Architecture

React owns durable app state:

- committed `CanvasModel`;
- last committed `CanvasModelChange`;
- selected theme;
- latest viewport/status snapshot mirrored from the engine;
- node access panel open/closed state.

`CanvasEngine` owns immediate canvas runtime state:

- private cloned model;
- theme;
- camera;
- selection and primary selection;
- hover and cursor state;
- active drag/pan/resize state;
- render-only preview geometries;
- touch points and two-finger gesture state;
- internal clipboard and paste counter;
- DPR, viewport size, render scheduling, and status scheduling.

The DOM/canvas owns:

- canvas bitmap size;
- pointer, keyboard, wheel, focus, blur, and resize events;
- `data-dpr`, `data-rendered-nodes`, and `data-total-nodes` probe counters.

React and the engine communicate through:

- `new CanvasEngine(canvas, { onStatus, onModelChange })`;
- `engine.setModel(model, { preserveInteraction: true })`;
- `engine.setTheme(theme)`;
- `engine.executeCommand(command)`;
- camera methods: `fit`, `resetZoom`, `zoomBy`.

## Command/Edit Contract

All committed edits must enter through `CanvasEngine.executeCommand(command)`.

Command types:

- `select-node`
- `clear-selection`
- `move-selection`
- `resize-primary`
- `delete-selection`
- `copy-selection`
- `paste-clipboard`

Edit sources:

- `pointer`
- `keyboard`
- `nonvisual`
- `ai`

The source is metadata and should not create separate edit semantics. If a command behaves differently by source, that must be a deliberate UX rule, not a separate mutation path.

The engine plans commands into `CanvasOperation[]` before mutation. Operations are the local abstraction for deterministic model updates:

- `set-selection`
- `set-node-geometry`
- `delete-nodes`
- `create-nodes`
- `set-paste-counter`
- `set-clipboard`

Do not add direct geometry mutation paths for pointer, keyboard, nonvisual, or AI edits. Extend the command and operation model instead.

## Preview Contract

Pointer drag and resize preview must not mutate committed model geometry.

Current flow:

1. Pointer movement builds the same `CanvasCommand` that commit would use.
2. The command is planned with `planCommand`.
3. The preview path stores render-only geometries from `set-node-geometry` operations.
4. Render uses `renderNode(node)` to overlay preview geometry.
5. Pointer-up clears preview geometry and commits through `executeCommand`.
6. Pointer cancel/lost capture/window blur clears preview geometry; pan rollback restores only camera state.

This is important because future undo/redo, collaboration, replay, and AI editing need a clean distinction between preview state and committed model state.

## Selection And Editing Semantics

Selection:

- Normal pointer click on an unselected node replaces selection.
- Normal pointer down on an already selected node preserves selection for drag.
- Shift/Cmd/Ctrl pointer click toggles node selection.
- Nonvisual node buttons support replace and toggle selection.
- Primary selection is the resize target.

Movement:

- `move-selection` applies to all selected nodes.
- Pointer group drag must preserve selected node ids and emit one `node-move` with all moved ids.
- Keyboard arrows move selected nodes by `32` world units.
- Shift plus arrow moves by `128` world units.

Resize:

- `resize-primary` applies only to the primary selected node.
- Keyboard `r` toggles resize mode.
- Arrow keys resize width/height in resize mode.

Clipboard:

- Clipboard is engine-internal only.
- No system clipboard API is claimed.
- Paste creates collision-free ids and selects pasted nodes.

Delete:

- Delete/Backspace or nonvisual delete removes the selected node/group and clears selection.

Snap:

- The editing grid is `32` world units.
- Pointer, keyboard, nonvisual, AI, and paste movement/resize must snap through the same planning logic.
- Zero-delta pointer interactions must not force old unsnapped nodes onto the grid.

## Rendering And Performance Shape

Rendering uses one 2D canvas.

Current rendering behavior:

- Canvas bitmap is sized from CSS size and capped DPR, with max DPR `2`.
- Camera transform is applied once for node drawing.
- Grid is drawn in screen space and skipped when too dense.
- Nodes are culled against visible world bounds plus a screen-space margin.
- Compact node rendering is used when zoomed far out or many nodes are visible.
- Selection and hover states affect strokes/shadows.
- Primary selected node shows a resize handle.

The current probe covers 1,000 and 2,000 visible simple nodes. This does not prove future performance for rich product nodes, edges, labels, minimaps, export, or layout engines.

## Accessibility And Nonvisual Contract

The canvas itself is focusable and labeled.

The node access panel provides the current generic nonvisual layer:

- semantic node list;
- node labels, kind, position, size, detail, and selection state;
- selection/toggle buttons;
- edit command buttons;
- status live region.

This is not a final product accessibility model. A product-level accessibility model must define object semantics, relationships, actions, names, descriptions, and expected assistive-technology workflows.

Do not fake accessibility with hidden text that cannot operate the same model. Nonvisual controls must call the same engine command path.

## Touch And Pointer Contract

Current automated coverage:

- pointer drag/resize/pan;
- plain wheel/trackpad pan;
- Shift-wheel horizontal pan;
- Ctrl/Cmd-wheel cursor-anchored zoom;
- pointer cancel;
- lost pointer capture;
- window blur;
- touch pointer ownership;
- two-finger pan;
- pinch zoom;
- second-touch rollback during node drag/resize;
- gesture cancellation cleanup.

Current unresolved gap:

- real iOS Safari and Android Chrome hardware behavior is not verified.

Do not claim mobile production readiness until physical device evidence exists.

## Verification Gate

Run this before saying a foundation change is complete:

```bash
npm run build
npm audit --omit=dev
npm run probe:canvas
git diff --check
```

What the gate proves:

- TypeScript compiles and Vite builds.
- Production dependency audit has no known vulnerabilities.
- Browser/CDP probe passes canvas contracts.
- No whitespace/conflict-marker diff problems.

What the gate does not prove:

- Safari/Firefox parity.
- Real-device touch behavior.
- Product-complete accessibility.
- Future backend/persistence/collaboration correctness.
- Performance of future product-specific graph shapes.

## Probe Maintenance Rules

When changing canvas behavior, update the probe in the same change.

Add or update probe coverage when touching:

- command planning;
- operation application;
- selection semantics;
- drag/resize preview;
- wheel/trackpad pan and modifier-wheel zoom;
- pointer cancel/lost capture/blur behavior;
- keyboard editing;
- nonvisual controls;
- copy/paste/delete;
- snap behavior;
- touch/gesture policy;
- lifecycle cleanup;
- large-model rendering.

The probe should assert behavior, not just log it.

Critical existing assertions to preserve:

- selection does not emit model changes;
- no-op edits do not emit model changes;
- real drag/resize emit exactly once;
- pointer group drag preserves multi-selection and moves all selected nodes;
- preview does not mutate committed model;
- cancellation clears preview or rolls back pan;
- listeners are balanced after dispose;
- 1,000/2,000 node render probes remain coherent.

## How To Extend The Engine

For a new edit action:

1. Add a typed `CanvasCommand` in `src/engine/types.ts`.
2. Add any required `CanvasOperation` type.
3. Implement planning in `CanvasEngine.planCommand`.
4. Apply the operation in `CanvasEngine.applyOperations`.
5. Emit a precise `CanvasModelChange` only for committed model changes.
6. Route pointer/keyboard/nonvisual/AI entry points through `executeCommand`.
7. Add probe coverage in `docs/canvas-foundation-devtools-probe.js`.
8. Add runner assertions in `scripts/run-canvas-foundation-probe.mjs`.
9. Update this KT doc or the current status report if the contract changes.

Do not:

- mutate nodes directly from event handlers for committed edits;
- fork separate pointer/keyboard/nonvisual/AI mutation paths;
- use preview mutation as committed state;
- add fallback/legacy paths;
- hide known gaps in docs;
- update historical reports as if they were the latest contract unless they are explicitly current.

## Current Known Limits

These are known and should remain explicit:

- The app is a generic canvas foundation, not a product-complete application.
- Real-device touch is blocked until hardware testing is available.
- Product object semantics are not defined.
- The internal clipboard is not the OS clipboard.
- There is no undo/redo stack yet, even though the operation model is a good base for it.
- There is no persistence or external model synchronization.
- Cross-browser coverage is not complete.

## Development Workflow

Recommended loop:

1. Read `docs/README.md` and this KT document.
2. Inspect live source before relying on historical reports.
3. Make the smallest coherent code change in the owner file.
4. Add or update probe assertions for the changed behavior.
5. Run the full verification gate.
6. Update docs if the architecture or contract changed.
7. Commit only scoped source/probe/doc changes.

Commit style used in this repo so far is short imperative messages, for example:

- `Fix canvas preview rollback repaint`
- `Harden canvas pointer preview and group drag`

## Fast Orientation For Future Agents

If you are resuming work cold:

1. Check `git status --short --branch`.
2. Read `docs/README.md`.
3. Read this file.
4. Read `src/engine/types.ts`.
5. Read `CanvasEngine.executeCommand`, `planCommand`, `applyOperations`, pointer handlers, and keyboard handler.
6. Read `docs/canvas-foundation-devtools-probe.js` around the behavior you are touching.
7. Run `npm run build` and `npm run probe:canvas` after changes.

The main architectural rule is simple: one command/operation path for all committed edits, with render-only preview for pointer interactions.
