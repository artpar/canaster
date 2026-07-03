# Goal Prompt: Perfect Canvas Keyboard, Touch, And Performance

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to close the three known canvas-foundation dents that prevent the app from being called polished and product-ready at the interaction layer:

1. Canvas keyboard editing semantics are missing.
2. Multi-touch gestures are intentionally ignored instead of implemented.
3. Large visible graphs render correctly but can jank badly at 1,000-2,000 nodes.

This is a frontend/canvas foundation task. Do not do ER diagrams, backend design, auth, persistence, database schema work, routing, collaboration, export, or domain-specific product modeling unless current repo code already contains those systems. Keep the work inside the current canvas/app foundation.

## Current Evidence

Start by reading and verifying:

- `docs/history/product-complete-remaining-dents-report.md`
- `docs/README.md`
- `scripts/run-canvas-foundation-probe.mjs`
- `src/App.tsx`
- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/sampleModel.ts`
- `src/styles.css`
- `package.json`

Known latest dents from the audit:

- The canvas is intentionally skipped in normal Tab order and has no keyboard editing model.
- Multi-touch has a safe ignore policy, but no pinch zoom, two-finger pan, or gesture state machine.
- 1,000 and 2,000 visible nodes render coherently, but stress evidence showed frame-time spikes around `699ms` for 1k and `1995.8ms` for 2k.

Do not assume these numbers or behaviors are still current. Reproduce them before changing code.

## Hard Rules

- Do not claim perfection from a happy-path demo.
- Define the interaction contract first, then implement.
- Keep keyboard semantics generic and truthful to the current `CanvasNode` model.
- Do not invent fake product/domain semantics for accessibility or keyboard labels.
- Prefer deterministic automated probes over manual-only verification.
- Do not regress existing single-pointer drag, resize, pan, cancellation, lost-capture, wheel zoom, theme toggle, DPR sizing, or listener cleanup behavior.
- Every fixed dent needs a regression probe or a precise reason why automation is not practical.
- If performance cannot be made excellent for all 2,000 visible labeled nodes, document the honest ceiling and implement the best generic foundation improvement.

## Phase 1: Baseline And Reproduction

Run:

```bash
git status --short --branch
npm run build
npm audit --omit=dev
npm run probe:canvas
```

Start the app for live checks:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Reproduce and record:

- Tab order and current canvas focus behavior.
- Unsupported keyboard events and whether they mutate model state.
- Single-pointer drag, resize, pan, cancel, and lost-capture behavior.
- Current multi-touch behavior for node drag, resize, pan, pinch-like movement, and two-finger pan-like movement.
- Current frame timing for 1,000 and 2,000 visible nodes in a fitted viewport.
- Console and network state before and after stress.

Use browser/devtools evidence where needed. Capture exact outputs in the final report.

## Phase 2: Design The Keyboard Contract

Implement a generic keyboard model for the current canvas foundation:

- Canvas must be reachable intentionally by keyboard without trapping ordinary toolbar navigation.
- Toolbar buttons must remain first-class keyboard controls.
- Canvas focus state must be visually clear.
- Selection must be discoverable through status text.
- Arrow keys should move the selected node by a normal step.
- Shift plus arrow should move by a larger step.
- Escape should clear selection or cancel an active keyboard operation.
- Enter or Space should select the nearest/currently focused node only if a coherent generic focus target exists.
- Delete/Backspace should not delete nodes unless deletion is explicitly part of the current model contract.
- Keyboard movement must emit the same kind of model-change callback as pointer movement, with source metadata that identifies keyboard origin.
- Keyboard actions must not mutate the model when no node is selected or when focus is outside the canvas.

If the current data model is insufficient for node focus traversal, add only the smallest generic state needed. Do not create product-specific object semantics.

Acceptance checks:

- Direct Tab sequence is documented and intentional.
- Canvas can be focused by keyboard.
- Focus ring is visible and does not overlap incoherently.
- Arrow and Shift+Arrow move only the selected node.
- No-selection keyboard events do not mutate the model.
- Toolbar keyboard behavior still works.
- Status output updates coherently after keyboard actions.

## Phase 3: Design The Multi-Touch Contract

Replace the current ignore-only policy with a real generic gesture contract:

- One pointer still owns drag, resize, and pan exactly as before.
- A second touch pointer during idle canvas interaction should start a two-touch gesture.
- Two-finger pan should move the viewport without mutating the model.
- Pinch should zoom around the gesture center without mutating the model.
- Adding a second touch during an active node drag or resize must either:
  - cancel and rollback the node operation, then enter gesture mode; or
  - ignore the second touch with a documented reason.
- Pointer cancel, lost capture, and window blur must always leave no stuck gesture state.
- Mouse and pen behavior must not regress.
- Trackpad/wheel zoom must not regress.

Choose the policy explicitly and encode it in tests/probes.

Acceptance checks:

- Single-touch drag/resize/pan still passes.
- Wrong pointer ids remain ignored for single-pointer operations.
- Two-finger pan changes viewport only.
- Pinch changes zoom only.
- Gesture cancel/lost-capture/blur leaves no active gesture state.
- No multi-touch gesture creates model changes.
- Status output distinguishes pan/zoom gesture from model edits.

## Phase 4: Make Large Graph Rendering Smooth Enough

Treat performance as a product-facing reliability issue. First profile, then fix.

Measure:

- time to first coherent render for 1,000 and 2,000 nodes;
- max frame time during fitted-viewport render;
- average frame time over a small frame window;
- interaction latency while panning and zooming 1,000 and 2,000 nodes;
- render counts and culling correctness;
- memory/listener stability after repeated model swaps.

Investigate likely causes:

- drawing text for every visible node;
- no render budget or level-of-detail strategy;
- culling behavior when all nodes are fitted into view;
- repeated layout/text measurement;
- unnecessary full redraws;
- event-driven redraw scheduling;
- high-DPR bitmap cost.

Implement generic foundation improvements before visual shortcuts:

- viewport culling correctness;
- level-of-detail text rendering when zoomed far out or node density is high;
- cached text metrics where useful;
- render scheduling that coalesces redundant draws;
- optional frame-budgeted rendering only if it keeps the canvas visually honest;
- no fake counters or skipped model ownership to make tests pass.

Define an explicit performance target before finalizing. A reasonable first target:

- 1,000 visible nodes: no frame above `100ms` during the measured render window.
- 2,000 visible nodes: no frame above `200ms` during the measured render window.
- Average frame time should be materially lower than the old `43.2ms` for 1k and `109.7ms` for 2k evidence.

If the target is not reachable without a larger architectural change, document the measured ceiling and the next architecture step.

Acceptance checks:

- 1,000 and 2,000 node probes still render coherent counters.
- Performance numbers improve materially and are recorded.
- Visual output remains understandable at normal zoom.
- Low zoom can use level-of-detail, but must not lie about selection, hit targets, or render counters.
- Drag, resize, pan, wheel, keyboard, and touch remain responsive after large-model swaps.

## Phase 5: Automation

Update or extend `scripts/run-canvas-foundation-probe.mjs` to cover the new contracts.

At minimum, the probe should verify:

- keyboard focus and movement behavior;
- no-selection keyboard no-op behavior;
- toolbar Tab order remains coherent;
- single-pointer behavior remains coherent;
- two-touch pan and pinch behavior;
- gesture cancellation cleanup;
- 1,000/2,000 node performance windows;
- no model changes from viewport-only gestures;
- listener cleanup after repeated setup/dispose cycles.

Do not weaken existing assertions. If an existing assertion changes because the intended behavior changed, explain the old behavior, the new behavior, and why the new contract is better.

## Phase 6: Browser Verification

Use live browser inspection after automation passes.

Verify at least:

- desktop `1280x900`;
- mobile/high-DPR `390x844x3`;
- dark and light themes;
- keyboard focus visuals;
- selected-node keyboard movement;
- two-touch emulation where possible;
- console has no unexpected errors/warnings;
- network has no unexpected failures;
- no incoherent layout overlap.

Capture screenshots or snapshots for:

- desktop keyboard-focused canvas;
- desktop selected node after keyboard move;
- mobile/high-DPR layout;
- large graph low-zoom level-of-detail state, if implemented.

## Phase 7: Final Report

Create or update:

`docs/history/canvas-keyboard-touch-performance-completion-report.md`

The report must include:

- executive verdict: `perfected`, `reliable enough`, `partially fixed`, or `blocked`;
- exact interaction contracts implemented;
- exact performance targets and actual before/after measurements;
- commands run and outputs summarized;
- browser/devtools evidence;
- screenshots/snapshot paths, if captured;
- residual risks;
- explicit statement of anything still not product-complete.

Also update `docs/README.md` so this report appears in the current-status reading order.

## Final Required Gates

Run and pass:

```bash
npm run build
npm audit --omit=dev
npm run probe:canvas
```

Then run a clean live browser check and stop any dev server you started.

The task is complete only when the three dents have either been fixed with evidence or explicitly downgraded to a documented larger-product/architecture decision with measurements proving why.
