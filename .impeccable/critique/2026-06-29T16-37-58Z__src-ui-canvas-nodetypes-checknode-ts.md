---
target: src/ui/canvas/nodeTypes/checkNode.ts
total_score: 22
p0_count: 0
p1_count: 2
timestamp: 2026-06-29T16-37-58Z
slug: src-ui-canvas-nodetypes-checknode-ts
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Done count is visible, but item-level actions mostly resolve as generic engine status. |
| 2 | Match System / Real World | 3 | Checklist language is practical and non-technical; delete/open affordances are less plain. |
| 3 | User Control and Freedom | 2 | Global undo may recover edits, but the expanded editor has no cancel/close lifecycle of its own. |
| 4 | Consistency and Standards | 2 | The checklist list editor diverges from the shared inline editor lifecycle and from the documented checklist rollout contract. |
| 5 | Error Prevention | 2 | Empty add is prevented, but delete is immediate and the add path does not enforce the 100-item cap. |
| 6 | Recognition Rather Than Recall | 2 | Add and done count are visible; delete is hover/selection-only, and "+n more" does not clearly announce full-list editing. |
| 7 | Flexibility and Efficiency | 2 | Basic pointer and keyboard editing exist, but no reorder, batch path, or first-class nonvisual item actions. |
| 8 | Aesthetic and Minimalist Design | 3 | The canvas treatment is restrained and on-brand; the list panel is utilitarian but not overdesigned. |
| 9 | Error Recovery | 1 | Commit failures, capped items, malformed saved items, and deletion recovery are not surfaced near the editor. |
| 10 | Help and Documentation | 1 | ARIA labels exist, but there is no contextual guidance for hidden row actions or expanded list behavior. |
| **Total** | | **22/40** | **Acceptable: useful foundation, but checklist editing is not production-solid yet.** |

## Anti-Patterns Verdict

**LLM assessment**: This does not read as AI-generated visual slop. It follows the existing Canaster design system: compact canvas rows, restrained state color, practical labels, and no ornamental gradients/cards. The weakness is not aesthetics; it is an interaction contract that got ahead of the documented product boundary.

**Deterministic scan**: `detect.mjs --json src/ui/canvas/nodeTypes/checkNode.ts` returned `[]`. No detector findings, no false positives.

**Visual overlays**: No user-visible overlay is available. The repo instructions only allow `localhost:5173` and prohibit starting another process; the impeccable overlay flow would require a separate live-server process. Browser inspection used the running app at `http://localhost:5173` instead.

## Overall Impression

The checklist node is directionally right for Canaster: work-native, small, readable, and tied to completion. The biggest opportunity is to stop treating canvas row clicks as the whole editing model. The docs already say checklist item toggles belong in the drawer or behind a clean action payload contract; the current file skipped that step.

## What's Working

1. The canvas preview has the right information density. It shows completion progress, the top visible rows, checked state, and an add cue without turning the node into a mini spreadsheet.
2. Empty state language is plain and useful. `No checklist items` plus `Add first item` matches the documented checklist UX and does not assume technical knowledge.
3. Data parsing is defensive. Malformed item arrays are normalized safely and capped during parsing, which protects rendering from bad saved content.

## Priority Issues

**[P1] What**: Direct checklist row actions were added before the action payload boundary exists.

**Why it matters**: `checkNode.ts` encodes item operations into region strings like `item:${item.id}:checked` and parses them with a regex. The product plan explicitly says not to add direct checklist row hit-testing with encoded action strings until command payload shape exists. This matters because Canaster's nonvisual, pointer, keyboard, and future AI paths are supposed to share edit semantics. String-encoded pointer regions make the visible canvas smarter than the accessibility/action model.

**Fix**: Either move item toggle/edit/delete into the Work Items drawer using the same `set-node-data`/document command path, or introduce a typed node action payload contract that can carry `{ nodeId, itemId, action }` before keeping direct canvas item controls.

**Suggested command**: `$impeccable shape src/ui/canvas/nodeTypes/checkNode.ts`

**[P1] What**: The expanded list editor has no real close/cancel/error lifecycle.

**Why it matters**: The shared inline inputs use `commitInputOnBlur`, Escape cancellation, and a dispose path. The checklist list editor commits every checkbox, text change, and delete immediately, returns `dispose() {}`, and never calls `close`. A user cannot confidently open the full list, make several edits, then cancel or finish. In an operational document, accidental deletion or half-finished edits are trust problems.

**Fix**: Give the list editor the same lifecycle as other inline editors: Escape closes/cancels when appropriate, explicit Done or blur behavior is defined, commit failures stay visible near the panel, and delete either has undo-visible feedback or a reversible row state.

**Suggested command**: `$impeccable harden src/ui/canvas/nodeTypes/checkNode.ts`

**[P2] What**: Touch and low-vision targets are too small for a field-work checklist.

**Why it matters**: The DOM checkbox is 15px square, canvas checkboxes can shrink to roughly 10-15px, and the delete affordance appears only on hover or selected state. That is usable with a mouse at a desk, but Canaster explicitly supports interrupted desk/field contexts and touch devices. Users should not need pixel precision to mark a work item done.

**Fix**: Keep the visual checkbox compact, but enlarge the hit regions to a stable touch-safe row target, expose delete through an explicit row action in the full editor, and make focus states visible for checkbox, text, add, and delete controls.

**Suggested command**: `$impeccable adapt src/ui/canvas/nodeTypes/checkNode.ts`

**[P2] What**: `+n more` hides the full-list action behind non-obvious text.

**Why it matters**: When the node has more items than fit, the user sees `+3 more`, but the region becomes `open-list`. Nothing in the label or visual treatment tells a first-timer that this opens the full checklist editor. That creates recall load: users must learn by accident that overflow text is interactive.

**Fix**: Render the overflow as an action cue, for example `Open full checklist (+3)` or a compact icon+label row consistent with Canaster's panel controls. The nonvisual label should also say what happens, not only `checklist items`.

**Suggested command**: `$impeccable clarify src/ui/canvas/nodeTypes/checkNode.ts`

**[P3] What**: The add path can exceed the persisted parser cap.

**Why it matters**: Parsing caps checklist items at 100, but the UI add path does not enforce that cap before committing. A long editing session can create items that later disappear on parse, which looks like data loss.

**Fix**: Disable add at `MAX_ITEMS`, show a plain limit message in the list editor, and keep the canvas add cue hidden or disabled when the list is full.

**Suggested command**: `$impeccable harden src/ui/canvas/nodeTypes/checkNode.ts`

## Persona Red Flags

**Alex (Power User)**: Alex can quickly add and toggle visible items, but cannot reorder, batch-edit, or operate a long checklist efficiently. The expanded editor commits each change immediately, so a fast sequence of edits may create noisy undo/history behavior.

**Sam (Accessibility-Dependent User)**: Sam gets some ARIA labels in the DOM editor, but canvas item actions are still pointer-region concepts. The `describe()` output exposes only label/details and no item-level actions, so nonvisual users cannot discover or toggle checklist rows through the same semantic model.

**Casey (Distracted Mobile User)**: Casey will struggle with 15px checkboxes and hover-dependent delete. The full editor is better than the canvas for touch, but its rows still use compact desktop sizing and there is no obvious Done/close affordance after adding an item.

## Minor Observations

- `Delete` is a text button in the list editor while the canvas uses an X glyph. The intent is clear enough, but the action vocabulary is split.
- The add row keeps the typed value through render, which is good. After adding, focus behavior depends on the newly rendered input being refocused by browser behavior rather than an explicit focus step.
- Checked rows use muted text plus strikethrough, so state is not color-only. That is a solid choice.

## Questions to Consider

- Should checklist row editing be a canvas interaction at all, or should canvas stay preview-first and the drawer own durable list editing?
- What is the one canonical nonvisual action shape for `toggle checklist item`, and why should pointer behavior differ from it?
- When a user opens the full checklist, are they entering a temporary editor or a persistent inspector surface?
