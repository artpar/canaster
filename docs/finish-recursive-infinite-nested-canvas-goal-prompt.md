# Goal Prompt: Finish Recursive Infinite Nested Canvas

You are working in `/Users/artpar/workspace/code/canway`.

## Objective

Finish the native, recursive, infinite nested canvas implementation for Canaster.

Canaster is not a preview-tile app and not a screenshot-based whiteboard. It is a recursive nested canvas system. Every canvas can contain child canvas panes, and every child canvas can itself contain child canvas panes, indefinitely. The implementation must treat this as one recursive rendering and interaction model, not as one-off special cases for root, child, preview, or active view.

## Product Model

The core visual model is a 3x3 spatial canvas composition:

- The center region is the current canvas.
- The 8 surrounding regions are parent-context panes:
  - north
  - south
  - west
  - east
  - northwest
  - northeast
  - southwest
  - southeast
- These 8 panes show adjacent siblings from the parent canvas, not decorative samples.
- Sibling panes can contain normal nodes or canvas nodes.
- Canvas nodes inside any pane are themselves live nested canvases and must recurse.
- This model applies whether the canvas is the main active view or is being rendered inside another canvas.

The visible result must be a recursive grid of canvases and sibling context panes. A nested canvas must never degrade into a grey placeholder, a miniature symbolic tile, a single guessed child preview, or a static screenshot.

## Hard Requirements

1. Implement the nested canvas runtime in native browser primitives, not React.
   - React may host the surrounding app shell.
   - React must not own recursive canvas rendering, canvas pane rendering, pointer routing, or per-frame nested canvas layout.

2. The implementation must be recursive.
   - No hardcoded root/child/grandchild branches.
   - No “central child” heuristic.
   - No one-off paths for the starter catalog.
   - The same algorithm should render a canvas at depth 0, 1, 2, 3, 4, and beyond.

3. Every rendered canvas instance must support:
   - a center canvas surface
   - 8 parent-context panes when it has a parent
   - live child canvas panes within its center
   - recursive rendering of child canvases within those panes
   - correct disposal/reuse of native engines/DOM nodes

4. Parent-context panes must render real sibling content.
   - Do not filter parent-context panes to only siblings that are canvas nodes.
   - Normal note/text/image siblings must still appear in the N/S/W/E/corner panes.
   - Canvas siblings must render as nested canvases and recurse.

5. Child canvas panes must remain live.
   - A canvas node inside another canvas must show the child canvas content in its viewport.
   - If that child canvas has its own parent-context panes, those panes must render too.
   - If that child canvas has its own child canvas nodes, those must render too.

6. Direct interaction must remain available at least 4 levels deep.
   - Panning/zooming/moving/resizing in a nested canvas must not rerender the entire world.
   - Updating one pane must not flicker unrelated panes.
   - Current active view controls may have larger visible handles.
   - Non-current embedded panes should use thin visual dividers, but must still render content.

7. Performance must be measured, not guessed.
   - Use Chrome DevTools CPU profiling or equivalent browser performance traces.
   - Use memory profiling/snapshots where relevant.
   - Use runtime logs to prove which recursive panes render, update, reuse, and dispose.
   - Start small if the full case freezes: 1x1x1, then 2x2x2, then 3x3x4, then the 820-document fixture.

8. Do not leave stale competing implementations.
   - Remove old React recursive rendering paths.
   - Remove symbolic SVG/sample preview paths if they no longer represent product behavior.
   - Remove synthetic “central child” or guessed child rendering paths.
   - Do not keep stale code “just in case”; it creates confusion.


## Verification Requirements

Before claiming completion, verify in Chrome as a real user would.

For starter catalog:

- Load the app.
- Load or reset to `service-business-atlas`.
- On root view, inspect `One job, four views`.
- Verify it renders:
  - center child canvas
  - NSWE/corner parent-context panes
  - internal child canvas panes
- Enter `visit-canvas` / `One job, four views` as active main view.
- Verify again:
  - center canvas
  - NSWE/corner parent-context panes
  - child canvas panes

For deep nested fixture:

- Select a center canvas with all 8 siblings.
- Verify all 8 regions exist and are visible.
- Verify normal sibling nodes render in context panes.
- Verify canvas sibling nodes recurse.
- Verify at least 4 levels remain live and directly inspectable.

Programmatic DOM/runtime checks are acceptable only if paired with real browser rendering checks. Useful assertions:

- Parent-context region count for a canvas with a full 3x3 parent should be 8.
- Region list should include `top`, `right`, `bottom`, `left`, `top-left`, `top-right`, `bottom-left`, `bottom-right`.
- Each region should contain rendered content, not just a divider or empty grey background.
- Canvas child panes should have live engine/canvas instances.
- Runtime logs should show recursive render/reuse/dispose events with stable owner keys.

Performance checks:

- Profile pan/zoom on active view.
- Profile moving one pane inside a nested canvas.
- Profile entering a nested canvas.
- Confirm these operations do not recreate the entire recursive tree unnecessarily.
- Confirm no infinite render/update loop.
- Confirm memory stabilizes after repeated enter/exit and pane resize operations.

## Non-Goals And Prohibited Fixes

Do not solve this by:

- Drawing static SVG miniatures.
- Drawing symbolic sample rectangles.
- Rendering only one guessed “central child”.
- Filtering sibling panes to only canvas nodes.
- Hardcoding `service-business-atlas` node ids.
- Adding special cases for `visit-canvas`.
- Reintroducing React recursive rendering.
- Making the center child canvas fill the whole area while hiding parent-context panes.
- Claiming success because internal child portal overlays render while NSWE/corner panes remain absent.

## Completion Criteria

The task is complete only when:

- The native recursive implementation renders a full 3x3 canvas composition for active and embedded canvases.
- NSWE/corner parent-context panes render real sibling content.
- Child canvas panes recurse through the same mechanism.
- At least 4 nested levels are live and inspectable.
- The starter catalog screenshot case is fixed.
- The deep 3x3x4 fixture passes browser verification.
- CPU and memory profiling show no freeze, infinite loop, or whole-tree rerender on local interactions.
- Stale competing code paths are removed.
- `npm run build` passes.
