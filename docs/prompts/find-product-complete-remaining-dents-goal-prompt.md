# Goal Prompt: Find Product-Complete Remaining Dents

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to find every remaining technical dent, gotcha, reliability issue, missing verification, product-completeness gap, and misleading assumption that prevents the current Canway app from honestly being called perfect.

This is a frontend/canvas foundation repo. Do not do ER diagrams, database analysis, backend API design, auth, persistence architecture, or server analysis unless current repo code actually contains those systems. If no such code exists, mark those areas out of scope with evidence and move on.

## Starting Point

Read and verify these first:

- `docs/history/canway-technical-dents-audit-report.md`
- `docs/history/canvas-foundation-gap-closure-report.md`
- `docs/canvas-foundation-devtools-probe.js`
- `scripts/run-canvas-foundation-probe.mjs`
- `package.json`
- `src/App.tsx`
- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/sampleModel.ts`
- `src/engine/theme.ts`
- `src/styles.css`

Known latest verdict:

- The current foundation is **reliable enough**, not perfect.
- Build, audit, automated canvas probe, live browser inspection, desktop/mobile/high-DPR checks, console/network checks, and stress loops passed in the latest audit.
- Remaining known dents include:
  - no product-specific nonvisual node/object model;
  - multi-touch gestures intentionally unsupported;
  - `probe:canvas` depends on local Chrome provisioning;
  - Safari/Firefox/real-device touch coverage missing;
  - no frame-time/performance profiling gate;
  - historical docs can be misleading without a current-status index.

Do not assume this is still true. Re-verify against the current checkout.

## Hard Rules

- Do not claim perfection unless every explicit check below is verified and no meaningful residual issue remains.
- Do not invent product features to make the app seem complete.
- Do not add domain semantics, parsers, persistence, routing, collaboration, export, backend code, database artifacts, or ER diagrams.
- Separate findings into: `confirmed issue`, `risk`, `intentional decision`, `out of scope`, or `not found`.
- Every finding must have evidence: file/line, command output, browser output, runtime state, screenshot, accessibility snapshot, or exact reproduction.
- If a small generic foundation bug is confirmed, fix it and rerun the relevant gates.
- If a gap needs product direction, document it. Do not guess.

## Phase 1: Current-State Inventory

Map what currently exists and what does not:

- source files and generated/install artifacts;
- package scripts and automation;
- runtime entry points;
- React-owned state;
- engine-owned transient state;
- model shape;
- input/event ownership;
- accessibility and keyboard surfaces;
- styling/layout rules;
- docs that are current vs historical;
- any backend/database/auth/persistence code, if present.

Run:

```bash
git status --short --branch || true
rg --files -g '!node_modules/**' -g '!dist/**' | sort
rg -n "CanvasEngine|setModel|onModelChange|onStatus|sampleModel|ViewportStatus|CanvasModel|CanvasNode" src docs scripts package.json
rg -n "addEventListener|removeEventListener|requestAnimationFrame|cancelAnimationFrame|ResizeObserver|setPointerCapture|releasePointerCapture|PointerEvent|WheelEvent|KeyboardEvent" src docs scripts
rg -n "tabIndex|aria-|role=|focus|blur|statusbar|button|canvas|touch-action|pointerType|pointerId|lostpointercapture|pointercancel|wheel|dblclick" src docs scripts
rg -n "TODO|FIXME|hack|ts-ignore|eslint-disable|as unknown|any|throw new Error|console\\." src docs scripts
rg -n "express|server|api|database|sqlite|postgres|schema|auth|fetch|localStorage|indexedDB|ER diagram|entity relationship|persistence|export|collaboration|route|router" src docs scripts package.json
```

## Phase 2: Re-run Required Gates

Run and record exact outputs:

```bash
npm run build
npm audit --omit=dev
npm run probe:canvas
```

If a gate fails, root-cause it before continuing. Do not loosen assertions unless you prove the assertion is wrong.

## Phase 3: Live Browser Verification

Run:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Use browser/devtools inspection to verify:

- app mounts cleanly;
- console has no unexpected errors/warnings;
- network requests are successful;
- canvas CSS size, bitmap size, DPR dataset, rendered/total counters are coherent;
- desktop layout has no incoherent overlap;
- mobile/narrow layout has no incoherent overlap;
- high-DPR cap works;
- dark and light themes render coherently;
- toolbar controls are keyboard focusable and named;
- canvas is not in normal Tab order;
- programmatic/pointer focus still works;
- unsupported canvas keyboard events do not mutate model state;
- statusbar role/live-region contract still holds.

If practical, capture screenshots or snapshots for:

- desktop dark state;
- desktop selected/zoomed state;
- mobile light state;
- mobile dark state.

## Phase 4: Product-Completeness Gap Hunt

Classify each area:

### Accessibility And Nonvisual Model

- Is canvas content exposed beyond a single labeled canvas?
- Are node labels, node selection, current viewport, and operations discoverable to nonvisual users?
- Would adding generic offscreen nodes be truthful without product semantics?
- What exact product semantics are missing before keyboard/nonvisual editing can be implemented?
- Is statusbar output useful or noisy?

### Keyboard And Interaction Model

- Is the current no-canvas-keyboard policy implemented?
- Are toolbar controls fully keyboard accessible?
- Are there any fake shortcuts or misleading focus states?
- What product decisions are needed before arrow keys, Enter, Space, Escape, delete, copy/paste, or resize-by-key can exist?

### Pointer, Touch, And Gesture Reliability

- Single-pointer drag/resize/pan still reliable?
- Wrong pointer ids ignored?
- Pointer cancel/lost-capture/window blur rollback?
- Multi-touch unsupported policy enforced?
- What would fail if product required pinch/two-finger pan?
- Real-device touch coverage missing?

### Rendering, Scale, And Performance

- DPR cap and bitmap sizing coherent?
- 1k/2k node checks still coherent?
- Any evidence of frame-time jank under many nodes?
- Long text, min-size, wide/tall, dense overlap, far coordinates still safe?
- What profiling gate is missing before performance claims?

### Automation And CI

- Does `npm run probe:canvas` pass and exit cleanly?
- Are probe failure messages actionable?
- Is Chrome path configurable or hardcoded?
- What exact CI/browser provisioning is needed?
- Should Playwright or another browser runner be added now, or just documented?

### Documentation And Operational Clarity

- Do older reports contradict current behavior?
- Is there a current-status index or “read this first” doc?
- Are generated artifacts like `dist/` and installed artifacts like `node_modules/` clearly not source-owned?
- Would a new engineer know which report is authoritative?

### Product Scope Boundaries

- Are missing persistence/export/routing/collaboration/domain semantics true product gaps, not current foundation bugs?
- Is any code pretending those features exist?
- Is sample text misleading, such as references to future layers or imported documents?

## Phase 5: Extra Stress

Do not blindly repeat existing probe coverage. Add checks only where coverage is missing or where the previous audit was app-level rather than source/probe-level.

At minimum, verify or run:

- 100 toolbar interactions;
- 100 wheel bursts;
- 100 node selection/drag/resize attempts;
- repeated canceled interactions;
- repeated theme toggles;
- direct Tab sequence;
- unsupported canvas key dispatch;
- mobile viewport;
- high-DPR viewport;
- console/network after stress.

If practical, add one temporary runtime check for frame-time or interaction latency under 2,000 nodes. If not practical, document exactly why it remains a profiling gap.

## Phase 6: Fix Or Document

For each confirmed issue:

- Fix it only if it is a small generic foundation issue.
- Do not implement product semantics without product direction.
- If the issue is docs clarity, add or update a small docs index/status note.
- If the issue is CI portability, either make the browser path configurable or document the exact CI requirement.
- After any code or script fix, rerun:

```bash
npm run build
npm run probe:canvas
```

## Output

Create or update:

`docs/history/product-complete-remaining-dents-report.md`

The report must include:

- Executive verdict: `perfect`, `reliable enough`, `risky`, or `blocked`.
- Why the verdict is not overstated.
- Current worktree context; if not a git repo, say so.
- Commands run and exact results.
- Browser/runtime evidence.
- Console/network findings.
- Screenshots/snapshots captured, if any.
- Source-search findings.
- Category-by-category classification.
- Confirmed issues fixed, if any.
- Confirmed issues not fixed, with reproduction/evidence/impact/next task.
- Intentional product decisions.
- Out-of-scope areas, including ER/database/backend analysis if absent.
- Residual risks.
- Final recommendation.

## Completion Criteria

The task is complete only when:

- `docs/history/product-complete-remaining-dents-report.md` exists.
- Every category above is classified with evidence.
- `npm run build` passed.
- `npm audit --omit=dev` passed or vulnerabilities are documented.
- `npm run probe:canvas` passed or failures are root-caused.
- `npm run dev` was used for live browser inspection.
- Browser console and network were inspected.
- Extra stress checks were run or explicitly marked covered by existing probe with evidence.
- Any small confirmed generic foundation bugs found were fixed and verified.
- Product-specific gaps were documented without speculative implementation.
- The final verdict does not claim `perfect` unless all meaningful gaps are actually resolved.
