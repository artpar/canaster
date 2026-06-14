# Goal Prompt: Find All Remaining Canway Technical Dents

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to determine whether the current Canway app is perfect or still has technical dents, gotchas, reliability issues, missing verification, ownership gaps, or product-foundation risks. Do not assume prior reports are complete. Use them as starting evidence, then re-check the live code, runtime, browser behavior, and package scripts.

This project is a frontend/canvas foundation. **Do not perform ER diagram, database schema, backend API, persistence, auth, or server architecture analysis unless such code actually exists in this repo.** If it does not exist, say it is out of scope and move on.

## Starting Evidence

Read these first:

- `docs/canvas-foundation-gap-closure-report.md`
- `docs/canvas-foundation-devtools-probe.js`
- `scripts/run-canvas-foundation-probe.mjs`
- `package.json`
- `src/App.tsx`
- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/sampleModel.ts`
- `src/engine/theme.ts`
- `src/styles.css`

Known current verdict from the latest report:

- The foundation is **reliable enough**, not perfect.
- `npm run probe:canvas` exists and passed in the prior run.
- The canvas is intentionally not in sequential tab order.
- Toolbar buttons are the current keyboard surface.
- Multi-touch gestures are unsupported; unrelated touch pointers should be ignored.
- The largest intentional residual gap is the lack of a product-specific nonvisual node/object model.

Do not trust these as current facts until you verify them against the current checkout.

## Hard Rules

- Do not claim perfection unless every area below is verified and no meaningful residual issue remains.
- Do not invent product features to make the app seem complete.
- Do not add domain-specific semantics, parsers, persistence, collaboration, export, routing, backend code, or database artifacts.
- Do not create ER diagrams or database plans; this is not that kind of project.
- Separate confirmed bugs from unproven risks, intentional product decisions, and out-of-scope product work.
- If you find a small foundation bug with a clear fix, fix it and verify it.
- If a fix would require product direction, document the issue and recommended next task instead of guessing.
- Every finding needs evidence: file/line, command output, browser/runtime proof, or exact reproduction.

## Phase 1: Map What Exists

Create a concise inventory of:

- Runtime entry points and app ownership.
- Canvas engine responsibilities.
- React state ownership.
- Model shape and mutation boundaries.
- Styling/layout/accessibility surfaces.
- Package scripts and probe/test automation.
- Anything that looks stale, unused, duplicated, or misleading.

Use source searches, not assumptions.

Suggested commands:

```bash
rg --files
rg -n "CanvasEngine|setModel|onModelChange|onStatus|sampleModel|ViewportStatus|CanvasModel|CanvasNode" src docs scripts package.json
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|PointerEvent|WheelEvent|KeyboardEvent" src docs scripts
rg -n "tabIndex|aria-|role=|focus|blur|statusbar|button|canvas|touch-action|pointerType|pointerId|lostpointercapture|pointercancel|wheel|dblclick" src docs scripts
rg -n "TODO|FIXME|hack|ts-ignore|eslint-disable|as unknown|any|throw new Error|console\\." src docs scripts
```

## Phase 2: Re-run The Existing Gates

Run and record exact results:

```bash
npm run build
npm audit --omit=dev
npm run probe:canvas
```

If any command fails, stop and investigate root cause. Fix only scoped foundation issues. Do not hide failures by loosening assertions without proving the assertion is wrong.

## Phase 3: Browser Runtime Inspection

Run the app:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Use a browser/DevTools inspection path to verify:

- app mounts without runtime errors;
- canvas CSS size, bitmap size, DPR dataset, rendered/total dataset;
- toolbar controls are present and accessible by name;
- statusbar has the intended `role`/`aria-live`;
- normal Tab order does not include the canvas;
- pointer/programmatic focus can still focus the canvas;
- keyboard events on the canvas do not imply unsupported behavior;
- console has no unexpected errors/warnings;
- network requests are successful;
- no visual overlap or layout breakage at desktop and mobile widths.

If possible, take screenshots or browser snapshots at:

- desktop viewport;
- mobile/narrow viewport;
- light theme;
- dark theme;
- after zoom/pan/selection.

## Phase 4: Find Technical Dents By Category

Investigate each category and classify any issue as `confirmed`, `risk`, `intentional`, `out of scope`, or `not found`.

### Correctness And State

- Model changes emit only for committed node move/resize.
- Selection, hover, wheel, double-click, theme, fit, reset, zoom, pan, resize observer, and canvas resize do not emit model changes.
- Zero-delta drag/resize emits no model changes.
- Canceled drag/resize/pan and lost pointer capture roll back.
- React re-handoff does not duplicate or stale out the engine model.
- Cloned model boundaries prevent accidental external mutation.

### Input Reliability

- Pointer capture/release is balanced.
- Wrong pointer ids are ignored.
- Multi-touch policy is actually followed.
- Wheel zoom stays bounded and anchored.
- Double-click zoom is bounded.
- Window blur clears active interaction.
- Toolbar clicks do not conflict with canvas pointer handling.
- Touch behavior remains controlled by `touch-action`.

### Rendering And Layout

- DPR capping and bitmap sizing are coherent.
- Culling renders edge/intersecting nodes and skips fully offscreen nodes.
- Long labels/details do not throw or corrupt layout.
- Min-size, wide, tall, dense-overlap, far-coordinate, and many-node models behave coherently.
- Statusbar/topbar do not hide critical controls or overlap incoherently on narrow viewports.
- Theme changes redraw without stale colors or model changes.

### Accessibility And Keyboard

- Current keyboard contract is explicit and implemented.
- Canvas is not in sequential tab order unless real keyboard behavior exists.
- Toolbar buttons have names and focus visibility.
- Statusbar live region is useful but not too noisy.
- Canvas content nonvisual representation is either implemented generically or documented as product-layer work.
- No fake `aria-keyshortcuts` or hidden semantics exist.

### Automation And CI Readiness

- `npm run probe:canvas` is deterministic and exits cleanly.
- Probe failure messages are specific.
- Probe browser dependency is documented.
- CI portability gaps are identified.
- Build/audit/probe commands are enough as a local foundation gate, or the missing gate is documented.

### Code Quality And Maintainability

- No stale docs contradict the current behavior.
- No dead or misleading scripts.
- No unnecessary dependencies.
- No large hidden globals or monkeypatches outside probes.
- No accidental source `any`, suppressions, TODOs, or broad casts.
- No broad refactors needed before the next product layer.

## Phase 5: Stress Beyond The Existing Probe

If the existing probe already covers a stress case, verify that coverage still exists and do not duplicate blindly. Add temporary browser/runtime checks only where coverage is missing.

Check at least:

- 100 repeated app-level toolbar interactions;
- 100 wheel bursts;
- 100 selection/drag/resize attempts;
- repeated theme toggles;
- repeated mount/dispose or isolated engine construction/dispose;
- at least one mobile viewport;
- at least one high-DPR or emulated DPR path if available;
- keyboard Tab sequence;
- console/network after stress.

If a stress check is impractical, mark it untested with the concrete blocker.

## Phase 6: Decide Whether To Fix

For each confirmed issue:

- If it is a small generic foundation fix, implement it.
- If it requires product semantics, do not implement it; document it.
- If it is automation-only, improve the probe/script if the change is small.
- If it is cosmetic but affects reliability or usability, fix it only if scoped.

After any fix, rerun the relevant targeted command plus:

```bash
npm run build
npm run probe:canvas
```

## Output

Create or update:

`docs/canway-technical-dents-audit-report.md`

The report must include:

- Executive verdict: `perfect`, `reliable enough`, `risky`, or `blocked`.
- Why the verdict is not overstated.
- Exact commit/worktree context if available; if not a git repo, say so.
- Commands run and exact pass/fail results.
- Browser/runtime evidence.
- Console/network findings.
- Source-search findings.
- Confirmed issues fixed, with severity, reproduction, source references, fix, and verification.
- Confirmed issues not fixed, with severity, evidence, impact, and next task.
- Intentional product decisions.
- Out-of-scope areas, including ER/database/backend analysis if no such code exists.
- Residual risks.
- Final recommendation.

## Completion Criteria

The task is complete only when:

- `docs/canway-technical-dents-audit-report.md` exists.
- Every category above is classified with evidence.
- `npm run build` has passed.
- `npm audit --omit=dev` has passed or any vulnerability is documented with package evidence.
- `npm run probe:canvas` has passed or the failure is root-caused.
- `npm run dev` has been used for live browser/runtime inspection.
- Browser console and network have been inspected.
- Any small confirmed foundation issues discovered are fixed and verified.
- Larger/product-specific issues are documented without speculative implementation.
- The final verdict does not claim `perfect` unless all meaningful gaps are resolved.
