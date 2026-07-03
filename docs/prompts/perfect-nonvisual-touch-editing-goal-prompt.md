# Goal Prompt: Perfect Nonvisual Access, Real Touch, And Advanced Editing

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to close the next three residual canvas-product dents:

1. No full nonvisual node/object accessibility tree.
2. No real-device touch verification before mobile production claims.
3. Delete, copy/paste, multi-select, and keyboard resize are intentionally not implemented.

This is still a frontend/canvas foundation task. Do not add backend services, persistence, auth, database schema, ER diagrams, routing, collaboration, export, or domain-specific product semantics unless the current repo already contains those systems. Keep the work generic and truthful to the current `CanvasModel` / `CanvasNode` shape.

## Current Evidence

Start by reading and verifying:

- `docs/README.md`
- `docs/history/canvas-keyboard-touch-performance-completion-report.md`
- `docs/history/product-complete-remaining-dents-report.md`
- `scripts/run-canvas-foundation-probe.mjs`
- `docs/canvas-foundation-devtools-probe.js`
- `src/App.tsx`
- `src/engine/CanvasEngine.ts`
- `src/engine/types.ts`
- `src/engine/sampleModel.ts`
- `src/styles.css`
- `package.json`

Known latest state:

- Canvas keyboard movement, two-touch pan/pinch, and 1k/2k rendering performance are already implemented and probed.
- The repo is a React/Vite frontend/canvas foundation, not a full product platform.
- The current model has generic nodes with `id`, `label`, `detail`, `kind`, `x`, `y`, `w`, and `h`.
- There is no product-specific object graph beyond generic nodes.
- Real-device touch has not been proven.
- Delete, copy/paste, multi-select, and keyboard resize are not part of the current contract.

Do not trust this summary blindly. Reproduce the current behavior before changing code.

## Hard Rules

- Do not claim perfection from canvas pixels alone.
- Do not fake accessibility by adding hidden text that cannot be operated.
- Do not invent product/domain semantics that are not in `CanvasNode`.
- Nonvisual controls must mutate the same model through the same engine ownership path as pointer/keyboard controls.
- Editing commands must be deterministic, reversible where needed, and covered by automation.
- Real-device touch evidence must be actual device/browser evidence or explicitly marked as blocked with exact reason. Chrome mobile emulation is not enough for the final claim.
- Do not regress existing keyboard movement, pointer drag/resize/pan, two-touch pan/pinch, cancellation rollback, performance gates, toolbar accessibility, DPR sizing, or listener cleanup.
- If an item requires product direction, document it as such. Do not fill gaps with placeholders.

## Phase 1: Baseline And Reproduction

Run and record:

```bash
git status --short --branch
npm run build
npm audit --omit=dev
npm run probe:canvas
```

Start the app:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Use browser/devtools inspection to reproduce:

- current accessibility tree for the app;
- what a screen reader or accessibility snapshot can discover about nodes;
- current keyboard command behavior for Delete, Backspace, copy, paste, multi-select modifiers, and resize attempts;
- current mobile/high-DPR touch behavior in emulation;
- whether any real-device touch evidence already exists in docs or tooling;
- console/network state before and after interaction stress.

Stop the dev server after live checks.

## Phase 2: Design A Truthful Nonvisual Node Tree

Create a generic nonvisual access layer that reflects the current canvas model without pretending to be a domain product.

Design requirements:

- The workspace must expose a structured list/tree of nodes to assistive technology.
- Each node must expose at least label, kind, detail, position, size, and selection state.
- The active/selected node must be discoverable nonvisually.
- Nonvisual node selection must select the same engine node as pointer/keyboard selection.
- Nonvisual move and resize actions must call the same engine model-change path as visual keyboard/pointer edits.
- The visual canvas must remain present and labeled.
- The nonvisual layer must not create duplicate confusing focus traps.
- Status/live-region updates must stay concise and useful.

Implementation options to evaluate:

- a visually hidden but focusable semantic node list;
- a visible compact inspector/sidebar if it improves usability without clutter;
- ARIA listbox/tree/grid patterns only if they map cleanly to generic nodes;
- `aria-activedescendant` only if focus ownership is coherent.

Acceptance checks:

- Accessibility snapshot shows the workspace, canvas, controls, and a discoverable node collection.
- Every sample node is present in the nonvisual structure with truthful name/metadata.
- Selecting a node nonvisually updates visual selection and status.
- Moving/resizing through nonvisual controls emits model changes with source metadata.
- The nonvisual layer does not break toolbar tab order or canvas keyboard operation.
- The probe verifies the semantic layer and at least one nonvisual selection/edit path.

## Phase 3: Implement Advanced Editing Commands

Add generic editing semantics for the current node model.

### Delete

- Delete and Backspace remove the selected node or selected nodes.
- Deletion emits a model-change event with source metadata.
- Deleting nothing is a no-op.
- Deleting selected nodes clears invalid selection state.
- The app must not leave ghost hover/selection references.

### Copy/Paste

- Copy duplicates the selected node or selected nodes into an internal clipboard.
- Paste creates new node ids deterministically enough to avoid collisions.
- Pasted nodes should be offset so they are visible and not exactly stacked.
- Paste selects the pasted node or group.
- Copy with no selection is a no-op.
- Clipboard behavior must be documented: internal app clipboard only unless real system clipboard integration is deliberately implemented and verified.

### Multi-Select

- Support multi-select with clear generic rules:
  - Shift-click or modifier-click toggles node membership; or
  - keyboard range/toggle model if pointer modifiers are unreliable.
- Multi-selection must be represented visually.
- Status must show multi-selection count.
- Move commands should move all selected nodes.
- Delete should delete all selected nodes.
- Copy/paste should preserve relative positions.
- Resize behavior for multi-selection must be explicitly defined. If group resize is out of scope, resize only the primary selected node and document it.

### Keyboard Resize

- Add a coherent keyboard resize mode.
- Enter/Space should not conflict with selection behavior.
- Suggested generic contract:
  - `r` toggles resize mode for the selected primary node;
  - Arrow keys resize width/height in resize mode;
  - Shift plus Arrow resizes faster;
  - Escape exits resize mode without deleting selection;
  - minimum size constraints remain enforced;
  - model changes use `node-resize` with `source: "keyboard"`.
- If using different keys, document the exact reason and verify no browser/AT conflict.

Acceptance checks:

- Delete/Backspace works for one and many selected nodes.
- Copy/paste works for one and many selected nodes.
- New pasted ids cannot collide with existing ids.
- Multi-select is visually and nonvisually discoverable.
- Keyboard move applies to all selected nodes.
- Keyboard resize applies to the defined target and respects minimum dimensions.
- All commands are no-ops when preconditions are missing.
- All changes emit coherent model-change metadata.
- Existing pointer and touch contracts still pass.

## Phase 4: Real-Device Touch Verification

Do not treat Chrome mobile emulation as sufficient.

First, add or document a repeatable real-device verification route:

- local network dev-server instructions;
- exact device/browser names;
- exact gestures to perform;
- expected status/model outcomes;
- screenshots or screen recordings path convention;
- how to collect console logs if available.

Required manual matrix, unless blocked:

- iPhone Safari or iPad Safari;
- Android Chrome;
- at least one high-DPR real device.

Required gestures:

- one-finger node select and drag;
- one-finger resize;
- one-finger blank-space pan if available on touch;
- two-finger pan;
- pinch zoom;
- second-touch during drag rollback;
- second-touch during resize rollback;
- gesture cancel/interruption where practical;
- orientation or viewport resize if practical.

Evidence must include:

- device/browser/version/date;
- pass/fail result for each gesture;
- screenshots or screen recording paths when possible;
- any console/runtime errors;
- any differences from emulation.

If physical devices are unavailable in the current environment:

- mark real-device verification as `blocked`, not complete;
- add the verification checklist to the final report;
- do not claim mobile production readiness.

## Phase 5: Automation

Extend `docs/canvas-foundation-devtools-probe.js` and `scripts/run-canvas-foundation-probe.mjs`.

At minimum, automate:

- accessibility structure exists and includes all sample nodes;
- nonvisual node selection updates engine selection/status;
- nonvisual move or resize mutates the model through the same callback path;
- Delete and Backspace behavior;
- copy/paste for one node;
- copy/paste for multiple nodes;
- selection state after delete and paste;
- multi-select pointer or keyboard behavior;
- keyboard resize mode;
- no-op behavior for missing selection/clipboard;
- listener cleanup for any new controls/listeners;
- no regression for existing keyboard, pointer, touch, and performance probes.

Do not weaken the existing probe. If a previous assertion changes because the product contract changed, explain the old behavior, new behavior, and why the new behavior is better.

## Phase 6: Live Browser Verification

After automation passes, run live checks on desktop and mobile emulation:

- desktop `1280x900`;
- mobile/high-DPR `390x844x3`;
- dark and light themes;
- accessibility snapshot;
- keyboard-only advanced edit flow;
- nonvisual node selection/edit path;
- pointer multi-select flow;
- copy/paste flow;
- delete flow;
- keyboard resize flow;
- two-touch gesture regression;
- 1k/2k performance regression;
- console/network clean state;
- no incoherent layout overlap.

Capture screenshots or snapshots for:

- accessibility/nonvisual node layer;
- multi-selection visual state;
- pasted-node state;
- keyboard resize state;
- mobile touch state.

## Phase 7: Final Report

Create or update:

`docs/history/nonvisual-touch-editing-completion-report.md`

The report must include:

- executive verdict: `perfected`, `reliable enough`, `partially fixed`, or `blocked`;
- exact nonvisual accessibility contract implemented;
- exact advanced editing contract implemented;
- real-device touch evidence or precise blocker;
- commands run and outputs summarized;
- browser/devtools evidence;
- screenshots/snapshot paths;
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

Then run live browser checks and stop any dev server you started.

The task is complete only when:

- the nonvisual node/object layer is implemented and verified;
- advanced editing commands are implemented and verified;
- real-device touch is either verified with evidence or explicitly blocked with a repeatable verification checklist;
- existing canvas keyboard, pointer, touch, and performance contracts still pass;
- the final report and docs index are current.
