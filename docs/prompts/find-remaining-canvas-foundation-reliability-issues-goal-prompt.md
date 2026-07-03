# Goal Prompt: Find Remaining Canvas Foundation Reliability Issues

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to find the remaining technical dents, gotchas, reliability issues, and unproven assumptions in the Canway canvas foundation after the latest investigation. Do not rerun the previous report as a ritual. Use it as a baseline, then push into the areas it explicitly left unproven and the failure modes it only partially covered.

This is a reliability investigation and hardening task. Do not add product features. Do not infer a product domain that is not present in the current code. Do not add parsers, domain-specific objects, semantic connection systems, layout engines, persistence UI, export, annotations, collaboration, or a heavy third-party canvas replacement.

## Starting Context

Read these first:

- `docs/history/canvas-foundation-dents-investigation-report.md`
- `docs/canvas-foundation-devtools-probe.js`
- `docs/prompts/find-all-canvas-foundation-dents-goal-prompt.md`
- `docs/history/canvas-engine-technical-dents-report.md`
- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/theme.ts`
- `src/engine/sampleModel.ts`
- `src/App.tsx`
- `src/styles.css`
- `package.json`

Current known verdict:

- The foundation is reliable enough, not perfect.
- A confirmed issue was fixed where a selected resize handle could lose priority when overlapping another node and emit `node-move` instead of `node-resize`.
- A checked-in DevTools/Vite probe exists, but it is not wired into CI or `npm test`.

Known remaining gaps to attack first:

- The checked-in probe is manual-browser only.
- Keyboard-only canvas behavior is not defined or proven.
- Assistive-technology behavior is not defined or proven.
- Multi-touch and touch-specific pointer behavior are not proven.
- Fractional DPR and DPR above the cap are not exhaustively tested.
- HMR cleanup is only observed, not stress-tested.
- Heap/memory growth is only indirectly checked through listener counters.
- Future complex product-specific node content is not represented by current simple rectangular nodes.

## Investigation Rules

- Work from current code, current runtime behavior, and repeatable evidence.
- Treat previous reports as claims to verify, not proof.
- Do not rely on visual impressions alone. Use callback counts, status text, canvas datasets, pixel samples, DOM state, console/network output, listener counters, performance timings, heap evidence, and browser/device emulation where practical.
- Separate proven facts, confirmed issues, suspected risks, and untested gaps.
- A suspicion becomes a confirmed issue only with source-level proof or a repeatable reproduction.
- If a confirmed issue is small, scoped to the current foundation, and has an obvious fix, fix it and verify the fix.
- If a confirmed issue is larger, architectural, or needs a product/design decision, do not hide it with a narrow patch. Document it with severity, reproduction steps, evidence, user impact, and a recommended next task.
- Keep code changes tightly scoped to reliability fixes or reliability test/probe infrastructure.

## Phase 1: Promote Or Replace The Probe

Evaluate `docs/canvas-foundation-devtools-probe.js`.

Decide whether to:

- Wire it into an `npm` script with a lightweight browser runner.
- Replace it with a Playwright-style test suite if the dependency cost is justified.
- Keep it as a manual DevTools probe only if automation is too expensive, and document exactly why.

Required probe coverage if automated:

- app mount DPR/render counters;
- hover/selection/zoom/theme/canvas-resize non-model-change boundaries;
- real drag and resize exactly-one model-change boundaries;
- no-op and zero-delta drag/resize boundaries;
- canceled drag/resize/pan rollback;
- lost pointer capture rollback;
- overlapping resize handle priority;
- culling edge and fully offscreen nodes;
- lifecycle listener cleanup after dispose.

Run the probe and include exact commands/results.

## Phase 2: Keyboard And Focus Audit

Determine what keyboard behavior the current foundation has and what it lacks.

Check at least:

- Tab order through toolbar buttons and canvas.
- Focus visibility for toolbar buttons.
- Canvas focus behavior after pointerdown.
- Whether focused canvas exposes any useful keyboard operations.
- Whether keyboard input can accidentally trigger pan/drag/zoom/model changes.
- Whether native button keyboard activation changes viewport/theme exactly once.
- Whether status text remains coherent after keyboard activation.

If no canvas keyboard interaction is intended yet, document that as a product/UX gap rather than a bug. If there is accidental keyboard-triggered behavior, confirm and fix it if small.

## Phase 3: Accessibility Surface Audit

Inspect the current accessibility tree and DOM semantics.

Check at least:

- canvas accessible name;
- toolbar button names and roles;
- statusbar discoverability;
- whether selected node/status changes should be announced;
- whether the canvas content has any nonvisual representation;
- whether the current foundation is acceptable for a canvas-first tool at this stage or needs a separate accessibility design task.

Do not invent a product-specific accessibility model. Document the minimum foundation gaps and recommended next task.

## Phase 4: Touch And Pointer Stress

Use browser emulation and scripted pointer events where practical.

Check at least:

- pointerType `touch` drag, resize, and pan;
- pointercancel during touch drag/resize/pan;
- two active pointer IDs interacting with the canvas;
- wheel absence on touch-only viewport;
- touch-action behavior;
- pointer capture behavior with touch pointer IDs.

Confirm whether multi-touch is unsupported by design, harmlessly ignored, or capable of corrupting drag/camera/model state. Fix only small foundation bugs.

## Phase 5: Device Pixel Ratio Matrix

Emulate or monkey-patch DPR values and verify bitmap/culling/render status.

Check at least:

- DPR `1`;
- current real DPR;
- fractional DPR such as `1.25` or `1.5`;
- high DPR above cap such as `3` or `4`, proving cap behavior;
- canvas resize after DPR change if practical.

Required invariants:

- canvas bitmap size equals CSS size times capped DPR;
- `data-dpr` matches the effective DPR;
- canvas remains nonblank;
- rendered/total counters stay coherent;
- hit testing remains aligned enough for selection/resize at tested DPRs.

## Phase 6: HMR And Remount Stress

Verify behavior beyond reading `dispose()`.

Check at least:

- repeated direct engine construction/disposal;
- React app remount if practical;
- Vite HMR after editing a harmless module or using the current dev server;
- listener counts before and after reload/HMR-like cycles;
- model-change callbacks after disposal;
- status callbacks after disposal;
- console errors during reload/HMR.

If HMR cannot be reliably automated, document the exact manual check and residual risk.

## Phase 7: Memory And Callback Churn

Look for growth that listener counters alone may miss.

Check at least:

- repeated mount/dispose cycles;
- repeated drag/resize/pan cycles;
- repeated wheel bursts;
- repeated theme toggles;
- status callback count per burst;
- model callback count per successful commit;
- heap snapshots or `performance.memory` if available.

Document whether memory evidence is direct, indirect, or unavailable.

## Phase 8: Future Model Shape Stress Without Product Features

Create runtime-only model shapes that stress the generic renderer without adding product behavior.

Check at least:

- dense overlapping nodes;
- very long unbroken labels;
- multiline detail with many words;
- min-size nodes;
- very wide/tall nodes;
- extremely negative coordinates;
- extremely positive coordinates;
- mixed coordinates near zero and far away;
- unusual but valid ids and labels;
- 1,000 simple nodes;
- more than 1,000 nodes only if practical without turning the investigation into benchmarking.

Measure:

- console errors;
- rendered/total counters;
- interaction responsiveness;
- pixel nonblank/redraw evidence;
- callback churn;
- whether culling behaves sensibly.

## Required Commands

Run:

```bash
npm run build
npm audit --omit=dev
npm run dev
```

Use the running app for browser/runtime probes.

Run targeted source searches:

```bash
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|onModelChange|setModel|dataset|canvas\\.width|canvas\\.height" src
rg -n "keydown|keyup|keypress|tabIndex|aria-|role=|statusbar|focus|blur|pointerType|pointerId|touch|lostpointercapture|pointercancel|wheel|dblclick" src docs
rg -n "TODO|FIXME|hack|any|as unknown|ts-ignore|eslint-disable|throw new Error|console\\." src docs
```

If you add or change any probe/test script, run it and include exact commands/results.

## Output

Create or update:

`docs/history/canvas-foundation-remaining-reliability-report.md`

The report must include:

- Executive verdict: `perfect`, `reliable enough`, `risky`, or `blocked`.
- Why the verdict is not overstated.
- Confirmed issues fixed, with severity, reproduction, source references, fix summary, and verification.
- Confirmed issues not fixed, with severity, reproduction, evidence, user impact, and recommended next task.
- Suspected but unconfirmed risks.
- Untested or partially tested areas, with reasons.
- Probe automation decision and exact commands.
- Keyboard/focus findings.
- Accessibility surface findings.
- Touch/pointer findings.
- DPR matrix findings.
- HMR/remount findings.
- Memory/callback-churn findings.
- Future model-shape stress findings.
- Console and network findings.
- Command results.
- Final recommendation for whether to proceed with the next product layer.

## Completion Criteria

The task is complete only when:

- `docs/history/canvas-foundation-remaining-reliability-report.md` exists.
- Every explicit check in this prompt is proven, disproven with evidence, or explicitly marked untested with a reason.
- Every confirmed small foundation issue discovered during the investigation is fixed and verified.
- Larger confirmed issues are documented with reproduction evidence and recommended next task.
- `npm run build` passes.
- `npm audit --omit=dev` reports no vulnerabilities.
- `npm run dev` has been used for browser/runtime probes.
- Browser/runtime probes have been run against the current app.
- Console and network output have been inspected.
- Any added or changed probe/test script has been run.
- The report clearly separates proven facts, confirmed issues, suspected risks, residual gaps, and untested areas.
- The final verdict does not claim `perfect` unless every explicit check is proven and no meaningful untested gap remains.
