# Goal Prompt: Find All Canvas Foundation Technical Dents

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to aggressively find every meaningful technical dent, gotcha, reliability issue, and unproven assumption in the current Canway canvas foundation. Do not assume the foundation is perfect because previous audits passed. Treat every prior report as a starting hypothesis that must be re-verified against the current worktree and runtime.

This is a reliability investigation and hardening task. Do not add product features. Do not infer a product domain that is not present in the current code. Do not add parsers, domain-specific objects, semantic connection systems, layout engines, persistence UI, export, annotations, collaboration, or a heavy third-party canvas replacement.

## Starting Context

Read these first:

- `docs/history/canvas-engine-technical-dents-report.md`
- `docs/history/canvas-engine-reliability-audit.md`
- `docs/prompts/find-all-canvas-engine-reliability-issues-prompt.md`
- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/theme.ts`
- `src/engine/sampleModel.ts`
- `src/App.tsx`
- `src/styles.css`
- `package.json`

The current known verdict is: reliable enough, not perfect.

Known residual risk areas:

- No checked-in browser interaction regression suite.
- Drag/resize use transient in-engine model mutation before pointer-up commit.
- Stress coverage uses simple runtime nodes, not future product-specific nodes.
- Keyboard, assistive-tech, multi-touch, unusual device-pixel-ratio, deep performance, and HMR edge cases are not fully proven.

## Investigation Rules

- Work from current code, current runtime behavior, and repeatable evidence.
- Do not rely on visual impressions alone. Use status text, canvas dataset values, pixel samples, model-change snapshots, console output, network output, DOM state, event/listener counters, performance timings, heap evidence, and screenshots only where useful.
- Separate proven facts, confirmed issues, unconfirmed suspicions, and untested gaps.
- A suspicion becomes a confirmed issue only with source-level proof or a repeatable reproduction.
- If a confirmed issue is small, scoped to the current foundation, and has an obvious fix, fix it and verify the fix.
- If a confirmed issue is larger, architectural, or needs a product/design decision, do not hide it with a narrow patch. Document it with severity, reproduction steps, evidence, and a recommended next task.
- Keep code changes tightly scoped to reliability fixes or reliability test/probe infrastructure.
- Prefer checked-in probes over one-off devtools scripts when practical.

## Phase 1: Build The Reliability Inventory

Create a complete inventory of mutable state, event sources, render outputs, and ownership boundaries.

Cover at least:

- React state: model, theme, status, last model change, engine ref.
- Engine state: cloned model, camera, selection, hover, drag state, cursor world point, DPR, view size, dirty/render frame, status frame, rendered counters, disposed flag.
- DOM state: canvas bitmap size, dataset fields, cursor style, document theme, statusbar text.
- Browser/runtime state: pointer capture, window listeners, ResizeObserver, animation frames, wheel events, double-click events, focus/blur.
- Derived state: visible world bounds, hit-test ordering, resize handle geometry, text clipping/wrapping, culling counters.

For each state item, identify:

- Owner.
- Write sites.
- Read sites.
- Commit boundary.
- Rollback behavior.
- Whether React and engine can diverge.
- Evidence needed to prove correctness.

## Phase 2: Build A State Machine And Transition Table

Map every interaction state and transition.

Include at least:

- Idle with no selection.
- Idle with selection.
- Hovering a node.
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
- Dev-server/HMR reload if observable.

For each transition, record:

- Trigger.
- Mutated state.
- Transient vs committed state.
- Expected rollback.
- Whether `onModelChange` is allowed.
- Whether render is required.
- Whether status update is required.
- Evidence that would prove success.
- Failure modes to try to trigger.

## Phase 3: Build A Cross-Product Interaction Matrix

Do not test only happy paths. Build a matrix and mark each cell as:

- Runtime-proven.
- Source-proven.
- Partially covered.
- Untested with reason.
- Failed with evidence.

Axes:

- Target: background, unselected node, selected node body, selected resize handle, overlapping node area, toolbar button, canvas outside any node, canvas at viewport edge.
- Input: pointer down/move/up, pointercancel, lostpointercapture, window blur, wheel, double-click, focus/blur, keyboard activation where applicable, rapid repeated input.
- Gesture size: no movement, zero-delta pointermove, sub-pixel/small movement, normal movement, large movement, movement outside canvas, movement outside viewport, direction reversal before release.
- Camera: fit scale, default scale, zoomed in, zoomed out, panned far from origin, negative world coordinates visible, high DPR, emulated low DPR if practical.
- Model shape: empty, one node, sample nodes, overlapping nodes, 100 nodes, 1,000 nodes if practical, offscreen nodes, nodes crossing viewport edges, negative coordinates, far-origin coordinates, min-size nodes, very wide/tall nodes, long labels/details, unusual ids/labels if allowed by types.
- Lifecycle timing: normal, during active drag, during active resize, during active pan, immediately after model commit, immediately after theme toggle, immediately after canvas resize, immediately before dispose, immediately after remount.

## Phase 4: Prove Model-Change Boundaries

Instrument or observe model-change callbacks and snapshots.

Required invariants:

- Hover emits no model changes.
- Selection emits no model changes.
- Pan emits no model changes.
- Fit/reset/button zoom emits no model changes.
- Wheel zoom emits no model changes.
- Double-click zoom emits no model changes.
- Theme toggle emits no model changes.
- Canvas resize emits no model changes.
- Canceled drag emits no model changes and restores visible geometry.
- Canceled resize emits no model changes and restores visible geometry.
- Canceled pan emits no model changes and restores camera.
- No-op pointer down/up on a node emits no `node-move`.
- Zero-delta pointermove during drag emits no `node-move`.
- No-op resize handle down/up emits no `node-resize`.
- Zero-delta pointermove during resize emits no `node-resize`.
- Successful drag emits exactly one `node-move`.
- Successful resize emits exactly one `node-resize`.
- Repeated rapid drag commits emit exactly one model change per successful commit.
- Repeated rapid resize commits emit exactly one model change per successful commit.
- The emitted model snapshot matches final visible geometry.
- React `setModel(..., { preserveInteraction: true })` does not overwrite committed geometry with stale data.
- React re-render does not unexpectedly clear a valid selection.
- Invalid selection/hover ids are cleared when the model no longer contains them.

Look specifically for hidden bugs caused by:

- Mutable node object references.
- Direct object mutation during drag/resize.
- Pointer cancellation between mutation and commit.
- Lost pointer capture after a partial mutation.
- Window blur during a partial mutation.
- Multiple interactions before status/model callbacks flush.
- React state updates racing with engine state.
- Stale closure values in React effects.

## Phase 5: Prove Render Correctness

Probe pixels and geometry where possible.

Required invariants:

- Canvas bitmap size equals CSS size times capped DPR.
- Canvas remains nonblank after mount, fit, zoom, pan, resize, theme toggle, and model commit.
- Text, node geometry, selection stroke, hover stroke, and resize handle stay attached under low/high zoom.
- Hit testing and rendering use compatible geometry.
- Resize handle drawing and resize handle hit testing use the same rectangle.
- Visible nodes are not culled.
- Fully offscreen nodes are culled.
- Nodes crossing viewport edges still render.
- Theme switch redraws background, grid, nodes, text, selection, hover, and resize handle colors.
- Long labels/details are clipped or omitted without drawing outside the node in a foundation-breaking way.
- Min-size nodes render coherently.
- Empty model does not crash and leaves coherent canvas/status.
- Very large and very small coordinates do not produce blank canvas, NaN status, or broken culling.

## Phase 6: Prove Lifecycle Cleanup

Do not stop at reading `dispose()`. Verify behavior.

Required checks:

- Every engine event listener is removed on dispose.
- ResizeObserver is disconnected on dispose.
- Queued render frames after dispose do not draw or throw.
- Queued status frames after dispose do not call React state setters.
- Active drag followed by dispose leaves no stale listeners or committed mutation.
- Active resize followed by dispose leaves no stale listeners or committed mutation.
- Active pan followed by dispose leaves no stale listeners.
- Remounting the app does not duplicate pointer, wheel, blur, or resize behavior.
- HMR reload does not leave duplicate handlers if practical to observe.

Use browser scripts, monkey-patched listener counters, React root mount/unmount probes, heap snapshots, or other repeatable evidence.

## Phase 7: Stress And Fault Injection

Create temporary runtime-only models or checked-in probe fixtures if useful. Do not turn them into product features.

Stress cases:

- 0 nodes.
- 1 node.
- Current sample model.
- 100 nodes.
- 1,000 nodes if practical.
- Long labels/details.
- Min-size nodes.
- Very wide/tall nodes.
- Overlapping nodes.
- Nodes with negative coordinates.
- Nodes far from origin.
- Nodes crossing viewport edges.
- Fully offscreen nodes.
- Rapid wheel bursts.
- Rapid drag commits.
- Rapid resize commits.
- Rapid theme toggles.
- Canvas resize during active drag.
- Canvas resize during active resize.
- Canvas resize during active pan.
- Window blur during active drag/resize/pan.
- Lost pointer capture during active drag/resize/pan.

Measure or record:

- Console errors and warnings.
- Failed network requests.
- Status update count and contents.
- Rendered/total counters.
- Model-change count and snapshots.
- Pixel samples for nonblank/redraw claims.
- Interaction latency or elapsed probe time.
- Frame starvation symptoms.
- Callback churn.
- Memory/listener growth across repeated mount/dispose cycles.

## Phase 8: Decide Whether To Add A Regression Harness

If there is no checked-in interaction test setup, decide whether to add one now.

Preferred options:

- Add a small browser-driven probe script if it can run with the existing stack and without heavy setup.
- Add Playwright only if the dependency/config cost is justified by durable coverage.
- If no harness is added, include exact devtools/browser scripts in the report and explain why a checked-in harness was deferred.

The most valuable repeatable probes are:

- model-change boundary checks;
- pointer interruption rollback checks;
- culling edge checks;
- lifecycle listener cleanup checks;
- nonblank canvas and theme redraw checks;
- rapid interaction callback-count checks.

## Required Commands

Run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Use the running app for browser/runtime probes.

Run targeted source searches, including:

```bash
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|onModelChange|setModel|dataset|canvas\\.width|canvas\\.height" src
rg -n "node-move|node-resize|selectedNodeId|hoverNodeId|drag|resize|pan|dispose|blur|lostpointercapture|pointercancel|wheel|dblclick" src
rg -n "TODO|FIXME|hack|any|as unknown|ts-ignore|eslint-disable|throw new Error|console\\." src docs
```

If a test/probe script is added, run it and include the exact command and result.

## Output

Create or update:

`docs/history/canvas-foundation-dents-investigation-report.md`

The report must include:

- Executive verdict: `perfect`, `reliable enough`, `risky`, or `blocked`.
- A short explanation of why the verdict is not overstated.
- Confirmed issues fixed, with severity, source references, reproduction evidence, fix summary, and verification evidence.
- Confirmed issues not fixed, with severity, reproduction steps, evidence, user impact, and recommended next task.
- Suspected but unconfirmed risks, clearly labeled.
- Untested or partially tested areas, with reasons.
- State inventory.
- State-machine transition table.
- Interaction cross-product matrix.
- Model-change boundary evidence.
- Render correctness evidence.
- Lifecycle cleanup evidence.
- Stress and fault-injection findings.
- Console and network findings.
- Command results.
- Regression strategy.
- Final recommendation for whether to proceed with the next product layer.

## Completion Criteria

The task is complete only when:

- `docs/history/canvas-foundation-dents-investigation-report.md` exists.
- Every explicit invariant in this prompt is proven, disproven with evidence, or explicitly marked untested with a reason.
- Every confirmed small foundation issue discovered during the investigation is fixed and verified.
- Larger confirmed issues are documented with concrete reproduction evidence and a recommended next task.
- `npm run build` passes.
- `npm audit --omit=dev` reports no vulnerabilities.
- `npm run dev` has been used for browser/runtime probes.
- Browser/runtime probes have been run against the current app.
- Console and network output have been inspected.
- The report clearly separates proven facts, confirmed issues, unconfirmed risks, residual gaps, and untested areas.
- The final verdict does not claim “perfect” unless every explicit invariant is proven and no meaningful untested gap remains.
