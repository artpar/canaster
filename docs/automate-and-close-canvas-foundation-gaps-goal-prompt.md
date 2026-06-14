# Goal Prompt: Automate And Close Canvas Foundation Gaps

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to close the remaining reliability gaps that keep the Canway canvas foundation from being called perfect. Do not repeat prior audits mechanically. Start from the latest evidence, automate what can be automated, and convert the remaining vague gaps into either fixed issues, explicit product/UX decisions, or documented residual risks with proof.

This is a reliability, testability, and foundation-design task. Do not add product features. Do not infer a product domain that is not present in the current code. Do not add parsers, domain-specific objects, semantic connection systems, layout engines, persistence UI, export, annotations, collaboration, or a heavy third-party canvas replacement.

## Starting Context

Read these first:

- `docs/canvas-foundation-remaining-reliability-report.md`
- `docs/canvas-foundation-devtools-probe.js`
- `docs/canvas-foundation-dents-investigation-report.md`
- `docs/find-remaining-canvas-foundation-reliability-issues-goal-prompt.md`
- `src/engine/CanvasEngine.ts`
- `src/App.tsx`
- `src/styles.css`
- `package.json`

Current known verdict:

- The foundation is reliable enough, not perfect.
- The latest pass fixed touch pointer ownership, canvas focus visibility, and statusbar live semantics.
- Remaining blockers to “perfect” are mostly automation, keyboard/nonvisual accessibility design, unsupported multi-touch policy, long-running confidence, and future rich model stress.

## Hard Rule

Do not claim perfection unless every explicit check below is automated or proven, and every remaining gap is either fixed or intentionally documented as a product decision with a concrete rationale.

## Phase 1: Automate The Browser Probe

Evaluate the current manual probe:

- `docs/canvas-foundation-devtools-probe.js`

Choose the smallest durable automation path:

- Add an `npm` script that runs a local browser probe against Vite.
- Or add Playwright if and only if the dependency/configuration cost is justified.
- Or document why automation is still not worth it, but only after proving the cost or blocker from the current repo.

The automated probe must cover at least:

- app mount DPR/render counters;
- hover/selection/zoom/theme/canvas-resize non-model-change boundaries;
- real drag and resize exactly-one model-change boundaries;
- no-op and zero-delta drag/resize boundaries;
- canceled drag/resize/pan rollback;
- lost pointer capture rollback;
- overlapping resize handle priority;
- touch pointer ownership;
- culling edge and fully offscreen nodes;
- lifecycle listener cleanup after dispose.

Required outcome:

- Either `npm run <probe-or-test>` exists and passes, or the report contains a concrete reason automation was deferred.

## Phase 2: Define The Keyboard Contract

Determine whether the generic canvas foundation should support keyboard operations now.

Investigate and decide:

- Should canvas be in tab order today?
- If yes, what should arrow keys, `+`, `-`, `Enter`, `Escape`, and `Space` do?
- If no, should canvas remain focusable only after pointer interaction, or should it be removed from tab order?
- Should toolbar buttons remain the only keyboard-operable controls for now?
- Should selection movement/resizing wait for product-specific object semantics?

If the current behavior is acceptable for the foundation, document a clear keyboard policy.

If the current behavior is misleading or unreliable, fix it. Examples:

- remove canvas from sequential tab order while preserving pointer focus;
- add minimal non-product-specific keyboard pan/zoom;
- add explicit `aria-keyshortcuts` only if shortcuts actually exist.

Required outcome:

- A documented keyboard contract.
- Browser evidence that keyboard input follows that contract.

## Phase 3: Define The Accessibility Surface

Determine the minimum nonvisual accessibility surface for the current foundation.

Check and decide:

- Is `Canvas "Canway canvas"` plus toolbar buttons plus live status enough for the current foundation?
- Should the status text be more structured or less noisy for assistive tech?
- Should node labels/selection be exposed through an offscreen list now, or is that premature before product semantics?
- Should canvas content remain visual-only until a product-specific accessibility model exists?

Do not invent hidden product semantics. If a nonvisual node list is added, it must be generic and derived from the current `CanvasModel`, not product-specific.

Required outcome:

- Either a small accessibility improvement with verification, or a design note explaining the intentional current accessibility boundary and the next task.

## Phase 4: Multi-Touch Policy And Stress

The latest fix prevents a second touch pointer from committing the first pointer's drag. Now define the policy for multi-touch.

Check:

- second pointer down during drag;
- second pointer move/up during drag;
- second pointer cancel/lostcapture during drag;
- two-finger pan/pinch-like event order;
- touch resize plus unrelated pointer;
- touch pan plus unrelated pointer.

Decide whether multi-touch is:

- explicitly unsupported and ignored;
- treated as canceling the active interaction;
- reserved for future pinch/pan gestures.

Required outcome:

- Policy documented.
- Probe evidence proving the current implementation follows the policy.
- Fix any small mismatch.

## Phase 5: Long-Run Churn And Memory Confidence

Run longer stress than prior 20-cycle checks.

Check at least:

- repeated mount/dispose cycles;
- repeated drag/resize/pan commits;
- repeated canceled interactions;
- repeated wheel bursts;
- repeated theme toggles;
- status callback counts;
- model callback counts;
- listener balance;
- `performance.memory` before/after if available.

Use enough iterations to expose obvious leaks without turning this into a benchmark project. Record exact counts.

Required outcome:

- Evidence for callback/listener/memory behavior.
- Any confirmed leak fixed or documented.

## Phase 6: Future Model Shape Probe

Extend runtime-only stress models without adding product behavior.

Check:

- 1,000 nodes;
- 2,000 nodes;
- dense overlap;
- extreme coordinates;
- min-size nodes;
- very wide/tall nodes;
- long unbroken labels;
- long multiword details;
- mixed near/far coordinates;
- unusual valid ids and labels.

For each case record:

- rendered/total counters;
- elapsed probe window;
- model callback count;
- status callback count;
- console errors;
- whether culling result is coherent.

Required outcome:

- Either the current renderer remains reliable enough for these generic stresses, or confirmed scale/render issues are fixed or documented.

## Required Commands

Run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Run targeted searches:

```bash
rg -n "keydown|keyup|keypress|tabIndex|aria-|role=|statusbar|focus|blur|pointerType|pointerId|touch|lostpointercapture|pointercancel|wheel|dblclick" src docs
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|onModelChange|setModel|dataset|canvas\\.width|canvas\\.height" src
rg -n "TODO|FIXME|hack|any|as unknown|ts-ignore|eslint-disable|throw new Error|console\\." src docs
```

If you add an npm script or test/probe script, run it and include exact output.

## Output

Create or update:

`docs/canvas-foundation-gap-closure-report.md`

The report must include:

- Executive verdict: `perfect`, `reliable enough`, `risky`, or `blocked`.
- Why the verdict is not overstated.
- Probe automation decision and exact commands/results.
- Confirmed issues fixed, with severity, reproduction, source references, fix summary, and verification.
- Confirmed issues not fixed, with severity, reproduction, evidence, impact, and recommended next task.
- Keyboard contract and evidence.
- Accessibility surface decision and evidence.
- Multi-touch policy and evidence.
- Long-run churn/memory findings.
- Future model-shape stress findings.
- Console/network findings.
- Command results.
- Residual risks.
- Final recommendation.

## Completion Criteria

The task is complete only when:

- `docs/canvas-foundation-gap-closure-report.md` exists.
- Every explicit check in this prompt is proven, disproven with evidence, or explicitly marked untested with a reason.
- Every confirmed small foundation issue discovered during the investigation is fixed and verified.
- Larger confirmed issues are documented with reproduction evidence and recommended next task.
- `npm run build` passes.
- `npm audit --omit=dev` reports no vulnerabilities.
- `npm run dev` has been used for browser/runtime probes.
- Any added npm/test/probe command has been run and documented.
- Console and network output have been inspected.
- The final verdict does not claim `perfect` unless automation, keyboard, accessibility, multi-touch policy, churn, and model-shape checks are all resolved with no meaningful residual gap.
