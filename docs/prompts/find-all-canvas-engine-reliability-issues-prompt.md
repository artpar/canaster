# Prompt: Exhaustively Find Canvas Engine Technical Dents and Reliability Issues

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to find every meaningful technical dent, gotcha, and reliability issue in the current Canway canvas foundation before more product complexity is built on top. Treat the existing audit report as a starting point, not proof that the engine is complete or perfect.

This is an adversarial reliability investigation. Do not add product features or infer a product domain that is not present in the current code. Do not add parsers, domain-specific objects, semantic connection systems, layout engines, export, save/load, annotations, collaboration, or a heavy third-party canvas replacement.

## Starting Context

Read these first:

- `docs/history/canvas-engine-reliability-audit.md`
- `docs/prompts/audit-canvas-engine-reliability-prompt.md`
- `docs/prompts/fix-canvas-engine-foundation-prompt.md`
- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/theme.ts`
- `src/engine/sampleModel.ts`
- `src/App.tsx`
- `src/styles.css`

Current known status:

- The first audit found and fixed one confirmed issue: selection used to mutate z-order and emit a model change.
- The report says the current foundation is good enough to build on, but not perfect.
- Known residual risks include lack of checked-in interaction regression tests, transient in-engine model mutation during drag/resize, sample-only culling verification, and limited runtime teardown stress.

Your task is to go beyond that first audit and actively try to falsify the current confidence.

## Rules

- Work from current code, current runtime behavior, and repeatable evidence.
- Do not rely on visual impressions alone. Use observable evidence: status text, canvas dataset, pixel samples, event counters, model-change snapshots, console output, network output, DOM state, heap/listener evidence, or screenshots when useful.
- Distinguish confirmed issues from suspicions. A suspicion needs a reproduction path or source-level proof before it is called confirmed.
- If a confirmed issue is small, scoped to the current foundation, and has an obvious fix, fix it and verify the fix.
- If a confirmed issue is larger, architectural, product-directional, or needs a separate design choice, do not hide it with a narrow patch. Document it with reproduction evidence, severity, and a recommended next task.
- Prefer checked-in, repeatable probes over one-off manual checks when practical.
- Keep any code changes tightly scoped to reliability fixes or reliability test/probe infrastructure.

## Investigation Method

### 1. Build A Complete State Machine

Create a state-machine map for the engine and React wrapper.

Include at least:

- Idle with no selection.
- Idle with selection.
- Hovering node.
- Drag candidate before movement.
- Active node drag.
- Active resize.
- Active pan.
- Wheel zoom.
- Double-click zoom.
- Fit/reset/toolbar zoom.
- Theme switch.
- ResizeObserver resize.
- React model re-handoff after `onModelChange`.
- Dispose/unmount.

For every state transition, identify:

- The owner of the state being mutated.
- Whether the state is transient or committed.
- The expected rollback behavior.
- Whether `onModelChange` is allowed.
- Whether a render is required.
- Whether a status update is required.
- What evidence would prove correctness.

### 2. Build An Interaction Cross-Product Matrix

Test each interaction across relevant variants, not just one happy path.

Axes:

- Target: background, unselected node, selected node body, selected resize handle, overlapping node area, toolbar button.
- Input type: pointer down/move/up, pointercancel, lostpointercapture, window blur, wheel, double-click, keyboard focus/blur if applicable.
- Gesture size: no movement, sub-pixel/small movement, normal movement, large movement, movement outside canvas, movement outside viewport.
- Camera: fit scale, zoomed in, zoomed out, panned far from origin, negative world coordinates visible, high DPR.
- Model shape: empty model, one node, overlapping nodes, many nodes, offscreen nodes, very small/large nodes, long labels/details.
- Lifecycle timing: normal, during active drag, during active resize, during active pan, immediately after model commit, immediately after theme toggle, immediately after canvas resize.

Record which matrix cells are covered by runtime probes, which are covered only by static reasoning, and which are not covered.

### 3. Prove Model-Change Boundaries

Instrument or observe model-change behavior.

Required invariants:

- Hover must not emit model changes.
- Selection must not emit model changes.
- Pan, fit, reset zoom, button zoom, wheel zoom, double-click zoom, theme toggle, and canvas resize must not emit model changes.
- Canceled drag/resize must not emit model changes.
- Successful drag emits exactly one `node-move`.
- Successful resize emits exactly one `node-resize`.
- No-op pointer down/up on a node must not emit `node-move`.
- No-op resize handle down/up must not emit `node-resize`.
- The emitted model snapshot must match the final visible geometry.
- React's `setModel` re-handoff must not overwrite the committed geometry with stale data.
- React re-render must not unexpectedly clear a valid selection.

Look specifically for hidden bugs caused by:

- Mutable node object references.
- Dragging while React receives a model snapshot.
- `setModel(..., { preserveInteraction: true })`.
- Pointer cancellation between mutation and commit.
- Multiple rapid interactions before status/model callbacks flush.

### 4. Prove Render Correctness

Probe canvas pixels and geometry where possible.

Required invariants:

- Canvas bitmap size equals CSS size times capped DPR.
- Canvas remains nonblank after mount, fit, zoom, pan, resize, theme toggle, and model commit.
- Text, node geometry, selection stroke, and resize handle stay attached under low/high zoom.
- Visible nodes are not culled.
- Fully offscreen nodes are culled.
- Nodes crossing viewport edges still render.
- Theme switch fully redraws background, grid, nodes, text, selection, and resize handle colors.
- Long labels and details do not draw outside the node in a way that breaks the foundation.
- Empty model does not crash and leaves a coherent canvas/status.

### 5. Prove Lifecycle Cleanup

Do not stop at reading `dispose()`. Verify behavior.

Required checks:

- Event listeners added by the engine are removed on dispose.
- A queued render frame after dispose does not draw or throw.
- A queued status frame after dispose does not call React state setters.
- Active drag, resize, or pan followed by unmount does not leave global listeners with stale state.
- Re-mounting the app does not duplicate pointer/wheel/blur handlers.
- ResizeObserver is disconnected.

Use browser scripts, monkey-patched listener counters, React root mount/unmount probes, or other repeatable evidence.

### 6. Stress The Foundation

Create temporary runtime-only models through devtools or a small throwaway probe; do not turn them into product fixtures unless useful.

Stress cases:

- 0 nodes.
- 1 node.
- 4 sample nodes.
- 100 nodes.
- 1,000 nodes if practical.
- Long labels/details.
- Overlapping nodes.
- Nodes with negative coordinates.
- Nodes far from origin.
- Very wide/tall nodes.
- Repeated rapid wheel events.
- Repeated rapid drag commits.
- Repeated theme toggles.
- Window/canvas resize during interaction.

Measure or record:

- Console errors.
- Failed requests.
- Status update behavior.
- Rendered/total counters.
- Whether interaction remains responsive enough for the foundation.
- Any obvious frame starvation or unbounded callback churn.

### 7. Create A Repeatable Regression Harness If Practical

If the repo does not already have an interaction test setup, decide whether adding one is worth it now.

Acceptable options:

- Add a minimal Playwright or browser-driven probe script if dependencies and setup remain small and justified.
- Add a documented manual/devtools probe if adding test dependencies would be too much for this repo right now.
- Add no test harness only if you explain why and provide exact reproduction scripts in the report.

The preferred end state is that the most important invariants are repeatable without relying on memory or screenshots.

## Required Commands

Run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Use the running app for browser/runtime probes. If you add test/probe scripts, run them and include the exact commands and results.

Also run targeted source searches, for example:

```bash
rg -n "addEventListener|removeEventListener|requestAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|onModelChange|setModel|dataset|canvas\\.width|canvas\\.height" src
rg -n "node-move|node-resize|selectedNodeId|hoverNodeId|drag|dispose|blur|lostpointercapture|pointercancel" src
```

## Output

Create or update:

`docs/history/canvas-engine-technical-dents-report.md`

The report must include:

- Executive verdict: perfect, reliable enough, risky, or blocked. Do not use vague language.
- A list of confirmed issues fixed, with source references and verification evidence.
- A list of confirmed issues not fixed, with severity, reproduction steps, evidence, and recommended next task.
- A list of suspected but unconfirmed risks, clearly labeled as unconfirmed.
- The state-machine map.
- The interaction matrix with covered, partially covered, and uncovered cells.
- Runtime probe evidence.
- Command results.
- Console/network results.
- Performance/stress findings.
- Lifecycle cleanup findings.
- A regression strategy: checked-in tests/probes added, or exact reason they were not added.
- Final recommendation for whether to proceed with the next product layer.

## Completion Criteria

The task is complete only when:

- The report exists at `docs/history/canvas-engine-technical-dents-report.md`.
- Every explicit invariant in this prompt is either proven, disproven with evidence, or explicitly marked untested with a reason.
- Every confirmed small foundation issue discovered during the investigation is fixed and verified.
- Larger confirmed issues are documented with concrete reproduction evidence and a recommended next task.
- `npm run build` passes.
- `npm audit --omit=dev` reports no vulnerabilities.
- Browser/runtime probes have been run against the current app.
- Console and network output have been inspected.
- The report clearly separates proven facts, confirmed issues, unconfirmed risks, and residual gaps.
