# Nested Canvas Technical Architecture Plan

Date: 2026-06-15

Status: historical implementation plan. Do not follow this document for current source paths, current verification commands, or current implementation sequence.

Current source uses the Canaster `src/core`, `src/domain`, `src/app`, `src/infra`, and `src/ui` layout. Nested canvas runtime code now lives under `src/ui/canvas` and current document/domain logic lives under `src/domain`. Use `docs/README.md`, `docs/architecture-software-kt.md`, `PRODUCT.md`, `DESIGN.md`, and `docs/canaster-user-journeys.md` as the current contract set.

Original purpose: this was the concrete implementation plan for live nested canvases in the older Canway-era source layout. Keep it as provenance for decisions and rejected shapes, not as live instructions.

## Fixed Decisions

These decisions are final for the first real implementation:

- Build nested canvas as a 2.5D stack of live canvases.
- Use live nested `CanvasEngine` instances for visible child portal previews.
- Keep exactly one editable active engine at a time.
- Render live child engines as DOM canvas overlays clipped to portal viewport rects.
- Do not let node definitions create, own, cache, or dispose engines.
- Do not render child engines directly inside `canvasNodeDefinition.render`.
- Keep the committed schema-v2 node shape: `CanvasNode` has `type` and `data`, not `label`, `detail`, or `kind`.
- Keep `CanvasPortalNodeData.childCanvasId` inside `node.data`; do not add `childCanvasId` to base `CanvasNode`.
- Create a document collection layer above `CanvasModel`; do not overload one `CanvasModel` with multiple canvases.
- Use a parent-context border field around all four sides and four corners of the active plane.
- Render parent neighbors in a continuous fisheye-compressed border field, not as floating cards, shelves, or labeled buttons.
- Each parent-context border pane must show exactly one nearest neighbor for that direction, and that neighbor's real clipped `CanvasEngine` must fill the pane viewport. Portal neighbors render their child canvas when available, and non-portal neighbors render a one-node parent snippet canvas. Empty border boxes and small thumbnail projections are not acceptable.
- Parent-context panes must be exclusive cells in a 3x3, nine-cell frame. North, south, east, west, and all four corners share grid lines but never overlap.
- The active nested canvas is the center cell of that same 3x3 frame. It is not a parent-context pane, and the parent-context border field must not be implemented as an overlay above a full-viewport active canvas.
- The four border dividers and four corner/intersection points are draggable. Dragging a divider resizes one grid axis; dragging an intersection resizes both adjoining grid axes.
- Use shallow copy for portal nodes in the first implementation: pasted portal nodes must have `data.childCanvasId: null`.
- Require delete confirmation before deleting a portal node whose `data.childCanvasId` points to an existing child document.
- Forbid canvas cycles.
- Add generic node action routing before wiring portal actions.
- Route pointer, keyboard, nonvisual, and AI actions through the same command paths.
- Add deterministic probes for live engine focus ownership and parent/child model isolation.
- Keep animations disabled in probes, but implement the same final state as animated mode.

## Target File Structure

Create these files:

```text
src/engine/documentTypes.ts
src/engine/documentModel.ts
src/engine/documentCommands.ts
src/engine/workspaceHistory.ts
src/engine/workspaceStorage.ts
src/engine/nested/engineSlots.ts
src/engine/nested/portalLayout.ts
src/engine/nested/stackLayout.ts
src/engine/nested/parentContextField.ts
src/engine/nested/actionRouting.ts
src/engine/nested/NestedCanvasWorkspace.tsx
docs/nested-canvas-devtools-probe.js
scripts/run-nested-canvas-probe.mjs
```

Update these existing files:

```text
src/engine/types.ts
src/engine/CanvasEngine.ts
src/engine/nodeTypes/types.ts
src/engine/nodeTypes/canvasNode.ts
src/engine/nodeTypes/registry.ts
src/App.tsx
src/styles.css
package.json
docs/canvas-foundation-devtools-probe.js
scripts/run-canvas-foundation-probe.mjs
```

Ownership:

- `CanvasEngine` owns one canvas model's rendering and interaction.
- `NestedCanvasWorkspace` owns document collection state, active canvas id, engine slots, overlay placement, stack state, and parent-context field state.
- `documentCommands.ts` owns document-level commands and model mutation across canvases.
- `workspaceHistory.ts` owns pure workspace history operations: create, replace present, push, undo, redo, and snapshot hydration. It does not import React, Dexie, DOM APIs, or `CanvasEngine`.
- `workspaceStorage.ts` owns IndexedDB persistence through Dexie. It only loads, saves, and clears hydrated `CanvasWorkspaceSnapshot` values. It does not know how commands, undo, redo, or React state work.
- `canvasNodeDefinition` owns portal content chrome and action metadata only.
- `portalLayout.ts` owns conversion from engine-reported portal world rects to screen overlay rects.
- `parentContextField.ts` owns parent-space neighbor projection, fisheye compression, region assignment, and hit-map metadata.

## Data Model

Add `src/engine/documentTypes.ts`.

```ts
import type { Camera, CanvasEditSource, CanvasModel, CanvasNode, CanvasPortalNodeData, CanvasSelectionState, JsonObject, NodeData } from './types';
import type { NodeActionDescriptor } from './nodeTypes/types';

export type CanvasDocumentId = string;

export type CanvasDocumentCollection = {
  schemaVersion: 1;
  rootCanvasId: CanvasDocumentId;
  activeCanvasId: CanvasDocumentId;
  documents: Record<CanvasDocumentId, CanvasDocument>;
  view: NestedCanvasViewState;
};

export type CanvasDocument = {
  id: CanvasDocumentId;
  title: string;
  parentCanvasId: CanvasDocumentId | null;
  parentNodeId: string | null;
  model: CanvasModel;
};

export type NestedCanvasViewState = {
  cameras: Record<CanvasDocumentId, Camera>;
  selections: Record<CanvasDocumentId, CanvasSelectionState>;
  activeCanvasId: CanvasDocumentId;
  focusedEngineId: EngineSlotId;
  previewFocus: PortalPreviewFocus | null;
  stackPath: StackFrame[];
  parentContext: ParentContextFieldState;
  animationEnabled: boolean;
};

export type EngineSlotId = string;

export type EngineMode = 'active' | 'embedded-live' | 'preview-live' | 'context-live' | 'dormant';

export type PortalPreviewFocus = {
  parentCanvasId: CanvasDocumentId;
  portalNodeId: string;
  childCanvasId: CanvasDocumentId;
};

export type StackFrame = {
  canvasId: CanvasDocumentId;
  parentCanvasId: CanvasDocumentId | null;
  parentNodeId: string | null;
  depth: number;
};

export type ParentContextRegion =
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'top-left';

export type ParentContextFieldShape = {
  region: ParentContextRegion;
  parentCanvasId: CanvasDocumentId;
  node: CanvasNode;
  distance: number;
  projectedRect: { x: number; y: number; w: number; h: number };
  opacity: number;
  detail: number;
  portal: boolean;
};

export type ParentContextFieldState = {
  sourceCanvasId: CanvasDocumentId | null;
  sourcePortalNodeId: string | null;
  shapes: ParentContextFieldShape[];
};

export type DocumentCommand =
  | { type: 'select-canvas'; canvasId: CanvasDocumentId; source: CanvasEditSource }
  | { type: 'enter-child-canvas'; parentCanvasId: CanvasDocumentId; portalNodeId: string; source: CanvasEditSource }
  | { type: 'go-to-parent-canvas'; source: CanvasEditSource }
  | { type: 'activate-neighbor-portal'; parentCanvasId: CanvasDocumentId; portalNodeId: string; source: CanvasEditSource }
  | { type: 'focus-portal-preview'; parentCanvasId: CanvasDocumentId; portalNodeId: string; source: CanvasEditSource }
  | { type: 'create-child-canvas'; parentCanvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { type: 'create-canvas-portal'; parentCanvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { type: 'set-node-data'; canvasId: CanvasDocumentId; nodeId: string; from: NodeData; to: NodeData; source: CanvasEditSource }
  | { type: 'confirm-delete-selection'; canvasId: CanvasDocumentId; source: CanvasEditSource }
  | { type: 'cancel-delete-confirmation'; source: CanvasEditSource }
  | { type: 'execute-node-action'; canvasId: CanvasDocumentId; nodeId: string; actionId: string; source: CanvasEditSource };

export type DocumentModelChange =
  | { kind: 'active-canvas-change'; from: CanvasDocumentId; to: CanvasDocumentId; source: CanvasEditSource }
  | { kind: 'canvas-create'; canvasId: CanvasDocumentId; parentCanvasId: CanvasDocumentId; parentNodeId: string; source: CanvasEditSource }
  | { kind: 'node-data-change'; canvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { kind: 'portal-preview-focus'; canvasId: CanvasDocumentId; nodeId: string; source: CanvasEditSource }
  | { kind: 'delete-confirmation-open'; canvasId: CanvasDocumentId; nodeIds: string[]; source: CanvasEditSource };

export type PortalNode = CanvasNode<CanvasPortalNodeData>;
```

Rules:

- `CanvasDocumentCollection.schemaVersion` is `1`.
- `CanvasDocument.model.schemaVersion` remains `2`.
- `CanvasDocument.parentCanvasId` and `parentNodeId` are authoritative ancestry.
- `CanvasPortalNodeData.childCanvasId` is the portal reference.
- Parent references are not duplicated inside `CanvasPortalNodeData`.
- `CanvasPortalNodeData.nodeCount` is denormalized display data and must be refreshed by `syncPortalSummaries(collection)`.
- Document ids use `canvas-${counter}` for generated ids in the first implementation.
- Portal title defaults to the node description label at creation time.

Callout: two schemas exist.

`CanvasDocumentCollection.schemaVersion` describes multi-canvas document structure. `CanvasModel.schemaVersion` describes a single canvas model. Do not merge them.

## Document Model Helpers

Add `src/engine/documentModel.ts`.

Required exports:

```ts
export function createInitialDocumentCollection(rootModel: CanvasModel, rootTitle: string): CanvasDocumentCollection;
export function cloneDocumentCollection(collection: CanvasDocumentCollection): CanvasDocumentCollection;
export function canvasDocumentFor(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): CanvasDocument;
export function activeCanvasDocument(collection: CanvasDocumentCollection): CanvasDocument;
export function parentDocumentFor(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): CanvasDocument | null;
export function portalNodeForChild(collection: CanvasDocumentCollection, childCanvasId: CanvasDocumentId): PortalNode | null;
export function childDocumentForPortal(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, portalNodeId: string): CanvasDocument | null;
export function updateCanvasModel(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, model: CanvasModel): CanvasDocumentCollection;
export function updateNodeData(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeId: string, data: NodeData): CanvasDocumentCollection;
export function createChildCanvasForNode(collection: CanvasDocumentCollection, parentCanvasId: CanvasDocumentId, nodeId: string): CanvasDocumentCollection;
export function syncPortalSummaries(collection: CanvasDocumentCollection): CanvasDocumentCollection;
export function assertNoCanvasCycle(collection: CanvasDocumentCollection): void;
export function stackPathFor(collection: CanvasDocumentCollection, activeCanvasId: CanvasDocumentId): StackFrame[];
export function selectionForCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): CanvasSelectionState;
export function cameraForCanvas(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): Camera;
```

Implementation rules:

- Every helper returns a new collection object.
- Deep clone node `data` with `cloneNodeData`.
- `createChildCanvasForNode` converts a non-canvas node into a canvas portal by changing `type` to `'canvas'` and setting `data` to `CanvasPortalNodeData`.
- The previous non-canvas node data is not embedded into portal data.
- The created child document model is `{ schemaVersion: 2, nodes: [] }`.
- `syncPortalSummaries` sets portal title from child document title and nodeCount from child document model nodes length.
- `assertNoCanvasCycle` walks parent links and throws if a canvas id repeats.
- Missing referenced child documents are not auto-created.

Callout: no direct `node.data` mutation.

All portal data changes go through `updateNodeData` or a document command that calls it.

## Command Architecture

Add `src/engine/documentCommands.ts`.

Required exports:

```ts
export type DocumentCommandPlan = {
  collection: CanvasDocumentCollection;
  changes: DocumentModelChange[];
  interaction: string;
};

export function planDocumentCommand(collection: CanvasDocumentCollection, command: DocumentCommand): DocumentCommandPlan;
export function executeNodeAction(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId, nodeId: string, actionId: string, source: CanvasEditSource): DocumentCommandPlan;
export function commandForNodeAction(action: NodeActionDescriptor, canvasId: CanvasDocumentId, nodeId: string, source: CanvasEditSource): DocumentCommand;
export function stripPortalChildReferenceOnPaste(node: CanvasNode): CanvasNode;
export function selectedPortalNodesWithChildren(collection: CanvasDocumentCollection, canvasId: CanvasDocumentId): PortalNode[];
```

Command behavior:

- `enter-child-canvas` requires a `type: 'canvas'` node with normalized `data.childCanvasId` pointing to an existing document.
- `enter-child-canvas` stores current active camera and selection before changing active canvas.
- `enter-child-canvas` sets `activeCanvasId` and `focusedEngineId` to the child canvas id.
- `go-to-parent-canvas` requires the active canvas to have a parent.
- `go-to-parent-canvas` restores parent camera and selects `parentNodeId`.
- `activate-neighbor-portal` runs the same state transition as leaving through the current parent and entering the neighbor child.
- `focus-portal-preview` sets `previewFocus` only; it does not make the child editable.
- `create-child-canvas` creates a child document, converts the node to `type: 'canvas'`, updates portal data, refreshes summaries, and leaves the parent active.
- `create-canvas-portal` is an alias of `create-child-canvas`; both command ids map to the same implementation path.
- `set-node-data` asserts JSON safety and calls the node definition parser before committing.
- `execute-node-action` maps action id to a document command; unknown action ids return no model changes and interaction `Action unavailable`.
- `confirm-delete-selection` deletes only after confirmation is open; see delete rules below.

Canvas-engine command integration:

- `CanvasEngine` keeps owning movement, resize, selection, and camera for one canvas.
- `NestedCanvasWorkspace` receives `onModelChange` from the active engine and writes the updated model into the active document.
- `NestedCanvasWorkspace` intercepts delete/copy/paste for portal semantics through a new engine command guard.
- The engine command guard is added as `EngineOptions.beforeCommand?: (command: CanvasCommand) => CanvasCommand | false`.
- When `beforeCommand` returns `false`, `CanvasEngine.executeCommand` stops before planning.
- The active engine uses the guard for `delete-selection`, `copy-selection`, and `paste-clipboard`.

Delete rule:

- If selected nodes contain no portal with existing child content, delete behaves as today.
- If selected nodes contain at least one portal with existing child content, `beforeCommand` blocks engine delete and opens a confirmation state.
- Confirmation UI is a modal overlay owned by `NestedCanvasWorkspace`.
- Confirming runs `confirm-delete-selection`; this deletes selected parent nodes and also deletes all descendant child documents reachable only through those portals.
- Canceling clears confirmation state and leaves model unchanged.
- Deleting child documents is recursive and deterministic.
- Probe must verify both cancel and confirm paths.

Copy/paste rule:

- Copy behaves as today.
- Paste goes through `stripPortalChildReferenceOnPaste`.
- `stripPortalChildReferenceOnPaste` returns the same node except for canvas portal data:
  - `childCanvasId` becomes `null`;
  - `nodeCount` becomes `0`;
  - `title` becomes `${title} copy`.
- The paste interaction string for any stripped portal is `Pasted canvas node without child contents`.

Callout: no hidden deep copy.

Deep child tree duplication is not part of this implementation. Do not add it behind copy/paste.

## Node Action Routing

Update `src/engine/nodeTypes/types.ts`.

`NodeActionDescriptor.id` remains a string, but first-party action ids must use this union in implementation code:

```ts
export type BuiltInNodeActionId =
  | 'enter-child-canvas'
  | 'create-child-canvas'
  | 'focus-portal-preview';
```

Update `src/engine/nodeTypes/canvasNode.ts`.

Canvas node description actions:

- If `data.childCanvasId` is a non-empty string:
  - `enter-child-canvas`, label `Enter canvas`, available `true`;
  - `focus-portal-preview`, label `Focus preview`, available `true`.
- If `data.childCanvasId` is `null`:
  - `create-child-canvas`, label `Create child canvas`, available `true`.
- Broken child references are determined by `NestedCanvasWorkspace`, not node definition. The action router disables `enter-child-canvas` if the referenced document is missing.

Canvas node hit test:

- `canvasPortalViewportRect(contentRect)` defines the live aperture rect.
- `hitTest` returns `{ type: 'activate', action: 'enter-child-canvas' }` when the point is inside the aperture and `childCanvasId` exists.
- `hitTest` returns `{ type: 'activate', action: 'create-child-canvas' }` when the point is inside the aperture and `childCanvasId` is null.
- Body hit outside the aperture remains `{ type: 'body' }`.

Add to `canvasNode.ts`:

```ts
export function canvasPortalViewportRect(contentRect: NodeContentRect): NodeContentRect;
```

The function must return:

```ts
{
  x: contentRect.x + 6,
  y: contentRect.y + 36,
  w: Math.max(0, contentRect.w - 12),
  h: Math.max(0, contentRect.h - 72),
}
```

Callout: node definitions describe apertures; they do not mount engines.

## CanvasEngine API Changes

Update `src/engine/CanvasEngine.ts`.

Add public types to `src/engine/types.ts`:

```ts
export type EngineInteractionMode = 'active' | 'embedded-live' | 'preview-live' | 'context-live' | 'dormant';

export type ScreenRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PortalLayout = {
  parentCanvasId: string;
  portalNodeId: string;
  childCanvasId: string | null;
  worldRect: CanvasNodeGeometry;
  screenRect: ScreenRect;
  visible: boolean;
};
```

Extend `EngineOptions`:

```ts
export type EngineOptions = {
  canvasId?: string;
  interactionMode?: EngineInteractionMode;
  beforeCommand?: (command: CanvasCommand) => CanvasCommand | false;
  onCanvasDoubleClick?: (canvasId: string, event: MouseEvent) => boolean;
  onStatus?: (status: ViewportStatus) => void;
  onModelChange?: (model: CanvasModel, change: CanvasModelChange) => void;
  onPortalLayout?: (layouts: PortalLayout[]) => void;
};
```

Required behavior:

- Default `interactionMode` is `'active'`.
- In `'active'`, attach pointer, keyboard, wheel, double-click, focus, blur, and window listeners as today.
- In `'embedded-live'`, attach the same input listeners as active, but keep toolbar commands targeting the active plane.
- In `'embedded-live'`, single click, drag, wheel, and pinch interact with the embedded canvas directly; double-click is routed through `onCanvasDoubleClick` and enters that canvas when the host returns `true`.
- In `'preview-live'`, attach no keyboard listeners and no window pointer listeners.
- In `'context-live'`, attach no input listeners.
- In `'dormant'`, do not run a `CanvasEngine`; render cached bitmap or geometry-only placeholder.
- `setInteractionMode(mode)` can switch listener sets without reconstructing the engine.
- `setModel` still accepts only `schemaVersion: 2`.
- `CanvasEngine` emits `onPortalLayout` after each render.
- Portal layouts are calculated only for visible `type: 'canvas'` nodes.
- Portal layout uses `canvasPortalViewportRect(this.nodeContentRect(node))`.
- `screenRect` is rounded to CSS pixels and relative to the engine canvas bounding client rect.
- `worldToScreenRect(rect)` is a new public method used by stack and parent-context overlays.
- `focusCanvas()` is a public method that focuses input-capable engine canvases.

Command guard:

```ts
executeCommand(command: CanvasCommand) {
  const guarded = this.beforeCommand?.(command) ?? command;
  if (guarded === false) {
    this.emitStatus();
    return false;
  }
  ...
}
```

Callout: inactive engines render; active engine edits.

Never allow a preview or context engine to process movement, resize, delete, copy, paste, wheel pan, or keyboard commands directly. `embedded-live` engines are input-capable and may process normal canvas commands from their own pointer, wheel, touch, and focused keyboard events.

## Engine Slot Management

Add `src/engine/nested/engineSlots.ts`.

Constants:

```ts
export const MAX_LIVE_PORTAL_PREVIEWS = 8;
export const MAX_CONTEXT_ENGINES = 2;
export const MIN_PORTAL_PREVIEW_W = 24;
export const MIN_PORTAL_PREVIEW_H = 24;
```

Types:

```ts
export type EngineSlot = {
  id: EngineSlotId;
  canvasId: CanvasDocumentId;
  mode: EngineMode;
  canvas: HTMLCanvasElement;
  engine: CanvasEngine;
  rect: ScreenRect;
  zIndex: number;
};
```

Required exports:

```ts
export function engineSlotId(canvasId: CanvasDocumentId, mode: EngineMode, ownerId?: string): EngineSlotId;
export function livePortalSlotsFor(collection: CanvasDocumentCollection, activeLayouts: PortalLayout[]): PortalLayout[];
export function isPortalLiveRenderable(layout: PortalLayout): boolean;
export function disposeRemovedSlots(previous: Map<EngineSlotId, EngineSlot>, nextIds: Set<EngineSlotId>): void;
```

Live portal selection:

- Consider only visible portal layouts with `childCanvasId` pointing to an existing document.
- Reject portal layouts smaller than `24x24`; side border panes are intentionally narrow and still need recursive portal previews.
- Sort by visible area descending.
- Keep the first eight.
- All other portal layouts use the canvas node's coarse fallback rendering.

Slot modes:

- Active canvas uses one full-stage slot in mode `active`.
- Visible child portal previews use recursive slots in mode `embedded-live`.
- The parent and grandparent stack planes use up to two context slots in mode `context-live`.
- Older ancestors use dormant geometry slabs, not engines.

Callout: bounded live engines.

The first implementation must never mount more than eleven `CanvasEngine` instances:

- one active;
- eight embedded portal or border-pane viewports;
- two context ancestors.

## Portal Overlay Layout

Add `src/engine/nested/portalLayout.ts`.

Required exports:

```ts
export function normalizePortalLayout(layout: PortalLayout, stageRect: DOMRect): PortalLayout;
export function portalOverlayStyle(layout: PortalLayout): React.CSSProperties;
export function visiblePortalLayoutsForCanvas(layouts: PortalLayout[]): PortalLayout[];
```

Overlay style:

- `position: absolute`;
- `left/top/width/height` from `screenRect`;
- `overflow: hidden`;
- `borderRadius: 6`;
- `pointerEvents: auto` so the child canvas receives pointer, wheel, touch, and double-click events directly.

Embedded canvas:

- The embedded `CanvasEngine` renders into a child `<canvas>`.
- The child canvas fills the portal overlay.
- The child canvas is visually clipped by the overlay.
- The child engine handles pointer, wheel, touch, and focused keyboard interaction.
- The host handles double-click through `onCanvasDoubleClick` and makes that canvas active.

- Single click focuses preview.
- Double click enters child canvas.
- Enter key on focused preview enters child canvas.
- Wheel on focused preview is ignored in Phase 1; wheel still belongs to the active engine.

Callout: live does not mean uncontrolled.

The portal preview can visually update every frame, but input remains host-routed until the child becomes active.

## 2.5D Stack Layout

Add `src/engine/nested/stackLayout.ts`.

Constants:

```ts
export const STACK_MAX_VISIBLE_ANCESTORS = 2;
export const STACK_PARENT_SCALE = 0.82;
export const STACK_GRANDPARENT_SCALE = 0.68;
export const STACK_PARENT_OFFSET = { x: -48, y: 36 };
export const STACK_GRANDPARENT_OFFSET = { x: -86, y: 68 };
export const STACK_PARENT_OPACITY = 0.38;
export const STACK_GRANDPARENT_OPACITY = 0.22;
```

Required exports:

```ts
export function visibleStackFrames(collection: CanvasDocumentCollection): StackFrame[];
export function stackPlaneStyle(frame: StackFrame, stageRect: DOMRect): React.CSSProperties;
export function activePlaneStyle(stageRect: DOMRect): React.CSSProperties;
export function portalPathHighlight(collection: CanvasDocumentCollection): { canvasId: CanvasDocumentId; nodeId: string }[];
```

Rules:

- Active plane is always centered and full stage size.
- Parent plane is visible behind active plane with scale `0.82`, offset `(-48, 36)`, opacity `0.38`.
- Grandparent plane is visible behind parent with scale `0.68`, offset `(-86, 68)`, opacity `0.22`.
- Older ancestors render as edge slabs on the left with title only.
- Stack planes do not receive edit input.
- Clicking a visible parent plane runs `go-to-parent-canvas`.
- Clicking a grandparent plane runs repeated `go-to-parent-canvas` until that canvas is active.
- The portal path is highlighted on context engines using a new engine option `highlightNodeIds?: string[]`.

Animation:

- Use CSS transforms for scale, opacity, and offset.
- Duration is `160ms`.
- Easing is `cubic-bezier(0.2, 0, 0.2, 1)`.
- Probes set `animationEnabled: false`, which sets duration to `0ms`.

## Parent Context Border Field

Add `src/engine/nested/parentContextField.ts`.

Constants:

```ts
export const FIELD_BORDER_BAND = 112;
export const FIELD_MIN_BORDER_BAND = 24;
export const FIELD_MIN_CENTER_BAND = 72;
export const EMBEDDED_FIELD_CENTER_RATIO = 0.8;
export const EMBEDDED_FIELD_MIN_BORDER_BAND = 8;
export const EMBEDDED_FIELD_MIN_CENTER_BAND = 32;
```

Required exports:

```ts
export function buildParentContextField(collection: CanvasDocumentCollection, stageRect: DOMRect): ParentContextFieldState;
export function regionForContextVector(dx: number, dy: number): ParentContextRegion;
export function parentContextRegionLabel(region: ParentContextRegion): string;
```

Region algorithm:

```ts
const angle = Math.atan2(dy, dx) * 180 / Math.PI;
```

Because canvas y increases downward, use these buckets:

- `right`: `[-22.5, 22.5)`;
- `bottom-right`: `[22.5, 67.5)`;
- `bottom`: `[67.5, 112.5)`;
- `bottom-left`: `[112.5, 157.5)`;
- `left`: `[157.5, 180]` and `[-180, -157.5)`;
- `top-left`: `[-157.5, -112.5)`;
- `top`: `[-112.5, -67.5)`;
- `top-right`: `[-67.5, -22.5)`.

Selection:

- Source portal is `activeDocument.parentNodeId` in `activeDocument.parentCanvasId`.
- Siblings are all nodes in the parent canvas except the source portal node.
- For each sibling, compute center point from `x + w / 2`, `y + h / 2`.
- Assign region by angle.
- Assign every sibling to a top, right, bottom, left, or corner border pane.
- For each of the eight panes, keep only the nearest sibling by center-to-center distance from the source portal.
- Render no more than one sibling per pane.
- Set the selected sibling's `projectedRect` to the full pane viewport:
  - `top`: `x = band`, `y = 0`, `w = stageWidth - 2 * band`, `h = band`;
  - `right`: `x = stageWidth - band`, `y = band`, `w = band`, `h = stageHeight - 2 * band`;
  - `bottom`: `x = band`, `y = stageHeight - band`, `w = stageWidth - 2 * band`, `h = band`;
  - `left`: `x = 0`, `y = band`, `w = band`, `h = stageHeight - 2 * band`;
  - corners: use the corresponding `band x band` corner pane.
- Replace fixed `band` math with a normalized pane layout `{ left, right, top, bottom }`.
- Render pane canvases in a single CSS grid with columns `left, center, right` and rows `top, center, bottom`.
- Render the active `CanvasEngine`, stack planes, and active portal overlays inside the center grid cell only.
- Render the eight parent-context canvases in the surrounding grid cells only. The parent-context layer may position hit maps and resize handles over the whole frame, but it must remain pointer-transparent over the center cell.
- For recursive child canvases rendered inside portal or border panes, default the child 3x3 grid to an 80% center pane in both dimensions: left/right panes each start at 10% of the child panel width, and top/bottom panes each start at 10% of the child panel height.
- Recursive child canvases use compact pane constraints: `EMBEDDED_FIELD_MIN_BORDER_BAND = 8` and `EMBEDDED_FIELD_MIN_CENTER_BAND = 32`. Top-level workspace panes keep the normal `FIELD_MIN_BORDER_BAND` and `FIELD_MIN_CENTER_BAND`.
- `top` and `bottom` span only the center width between left and right panes.
- `left` and `right` span only the center height between top and bottom panes.
- Corner panes occupy only their own `{left/right} x {top/bottom}` cells.
- Drag handles:
  - left/right vertical dividers update `left` or `right`;
  - top/bottom horizontal dividers update `top` or `bottom`;
  - corner/intersection handles update both adjacent values.
- Clamp divider movement only to preserve valid grid geometry: each outer pane must remain at least `FIELD_MIN_BORDER_BAND`, and the center cell must remain at least `FIELD_MIN_CENTER_BAND`.
- Do not cap a pane at `FIELD_BORDER_BAND * 2` or any other cosmetic maximum. `FIELD_BORDER_BAND` is the initial/default size only; users must be able to drag dividers far beyond the default band while the remaining cells stay valid.
- Preserve the sibling's directional relationship to the source portal.
- Apply fisheye selection by distance: nearer siblings win their pane. Do not shrink the winning sibling inside the pane.
- Render every selected pane sibling through a real clipped `CanvasEngine` that fills the pane viewport.
- For a canvas sibling with an existing `childCanvasId`, render the child document model in the projected rect.
- For a non-canvas sibling, render a snippet model with `schemaVersion: 2` and exactly that sibling node in the projected rect.
- For a canvas sibling without an existing child document, render a snippet model for the portal node itself in the projected rect; do not show a hollow aperture-only placeholder.
- Do not render labels, text blocks, cards, shelves, or button-like visual boxes in the border field.
- Maintain a hit map from each pane rect to the selected parent node id.

Interaction:

- Activating a projected portal preview runs `activate-neighbor-portal`.
- Activating a projected non-portal shape runs `go-to-parent-canvas`, then selects the clicked sibling.
- Keyboard activation of a projected hit target follows the same rules.
- Parent-context shapes never run child engine edit commands.

Nonvisual:

- Expose SVG hit targets with labels from `parentContextRegionLabel(region)` and `describeNode(shape.node).label`.
- The labels are accessibility metadata only; they are not visible text in the border field.

Callout: parent context is eight-directional.

Do not collapse parent context into a right-side shelf, floating panels, labeled panel buttons, a panel list, or breadcrumbs.

## NestedCanvasWorkspace

Add `src/engine/nested/NestedCanvasWorkspace.tsx`.

Props:

```ts
export type NestedCanvasWorkspaceProps = {
  initialCollection: CanvasDocumentCollection;
  theme: ThemeName;
  storageKey?: string;
  onCollectionChange?: (collection: CanvasDocumentCollection, changes: DocumentModelChange[]) => void;
  onChromeStateChange?: (state: NestedCanvasWorkspaceChromeState) => void;
};

export type NestedCanvasWorkspaceChromeState = {
  collection: CanvasDocumentCollection;
  status: ViewportStatus;
  lastModelChange: DocumentModelChange | null;
  canUndo: boolean;
  canRedo: boolean;
};
```

Responsibilities:

- own `CanvasWorkspaceHistory` React state, where `history.present` is the active `CanvasDocumentCollection`;
- mount the active engine canvas;
- mount context engine canvases for visible ancestors;
- mount portal preview canvases for selected live portal layouts;
- route document commands;
- bridge active `CanvasEngine.onModelChange` into document model updates;
- maintain engine slots;
- maintain portal layouts from active and context engines;
- render parent-context border field;
- render compact breadcrumb fallback inside the active center cell;
- render delete confirmation modal.
- load and save `CanvasWorkspaceSnapshot` values through `workspaceStorage.ts`;
- use `workspaceHistory.ts` for undo/redo stack movement instead of mutating history inline.

Persistence and history rules:

- Persist `CanvasWorkspaceSnapshot` to IndexedDB through Dexie.
- Snapshot schema is `1` and contains `history.present`, `history.undoStack`, `history.redoStack`, and `lastModelChange`.
- `history.present.view` is the durable view position source: cameras, selections, active canvas, preview focus, delete confirmation, and parent-context pane layouts.
- Stage rects, portal overlay rects, hover state, frame timings, DOM measurements, and rendered-node counters are derived runtime state and must not be persisted.
- Model/document changes push undo history.
- Camera, selection, and pane-layout changes update `history.present` and are persisted, but do not create undo steps.
- Undo and redo restore full `CanvasDocumentCollection` snapshots, including active canvas, cameras, selections, and pane layouts.
- Top-level and recursive parent-context divider layouts must be written to `collection.view.paneLayouts[canvasId]`, not component-local state.
- `NestedCanvasWorkspace` may debounce normal saves, but explicit flushes and future unload handling must use the same `workspaceStorage.ts` adapter.

App shell responsibilities:

- render toolbar controls outside `NestedCanvasWorkspace`;
- render status bar outside `NestedCanvasWorkspace`;
- render node access panel outside `NestedCanvasWorkspace`;
- receive active collection/status/last-change state from `NestedCanvasWorkspace`;
- route toolbar and node-panel commands back through `NestedCanvasWorkspaceHandle`.

DOM structure:

```tsx
<section className="workspace">
  <div className="topbar" />
  <section className="nested-workspace">
    <div className="nested-stage">
      <div className="nested-center-cell">
        <div className="stack-planes" />
        <canvas className="canvas-surface active-plane" />
        <div className="portal-overlays" />
        <div className="stack-breadcrumb" />
      </div>
      <div className="parent-context-layer">
        <div className="parent-context-canvas-layer" />
        <svg className="parent-context-field" />
      </div>
    </div>
    <DeletePortalConfirmation />
  </section>
  <aside className="node-access-panel" />
  <div className="statusbar" />
</section>
```

CSS rules:

- `.nested-stage` is the real 3x3 grid and fills `.nested-workspace`.
- `.nested-center-cell` is the active canvas cell and owns stack planes, active canvas, active portal overlays, and breadcrumb.
- `.topbar`, `.statusbar`, and `.node-access-panel` are shell chrome and must not be descendants of `.nested-workspace`.
- All canvas planes are `position: absolute`.
- Active plane fills `.nested-center-cell`, not the outer stage.
- Portal overlays use absolute rects from `PortalLayout`.
- Parent-context visuals are edge-clipped real `CanvasEngine` canvases for the selected nearest sibling in each pane; SVG is only the transparent hit/affordance layer over rendered canvas content.
- Do not render parent-context siblings as floating panels, text labels, shelves, or node-access-panel items.

App integration:

- `src/App.tsx` uses `NestedCanvasWorkspace` instead of instantiating one `CanvasEngine` directly.
- `sampleModel` becomes the root model passed to `createInitialDocumentCollection(sampleModel, 'Root')`.
- Existing toolbar controls call active engine operations through workspace methods:
  - `fitActiveCanvas()`;
  - `resetActiveZoom()`;
  - `zoomActiveBy(factor)`;
  - `undoWorkspace()`;
  - `redoWorkspace()`;
  - `executeActiveCanvasCommand(command)`;
  - `executeDocumentCommand(command)`.

## Canvas Node Rendering Changes

Update `canvasNodeDefinition.render`:

- Draw portal title.
- Draw aperture rim using `canvasPortalViewportRect`.
- Draw `No child canvas` only when `childCanvasId` is null.
- Draw `Live preview unavailable` only when `childCanvasId` exists but the host has no live overlay for that portal.
- Draw `CANVAS` badge.
- Do not draw fake preview boxes when a live overlay exists.

To support this, extend `NodeRenderState`:

```ts
export type NodeRenderState = {
  selected: boolean;
  primary: boolean;
  hovered: boolean;
  quality: NodeRenderQuality;
  portalPreview: 'none' | 'live' | 'unavailable';
};
```

Core engine sets `portalPreview` by checking a new `EngineOptions.livePortalNodeIds?: Set<string>`.

Default for non-canvas nodes is `'none'`.

## Input And Hit Testing

Active engine pointer rules:

- Resize handle wins.
- Node body selection wins outside portal aperture.
- Portal aperture activation runs node action routing.
- Dragging a selected portal by its body moves the parent node.
- Dragging inside the aperture focuses or enters, never moves the child model.

Preview overlay pointer rules:

- Single click: `focus-portal-preview`.
- Double click: `enter-child-canvas`.
- Pointer drag: ignored in Phase 1.
- Wheel: ignored in Phase 1.

Context plane pointer rules:

- Parent plane click: `go-to-parent-canvas`.
- Grandparent plane click: `select-canvas` to that ancestor.
- Drag and wheel are ignored on context planes.

Keyboard rules:

- Active engine canvas is the only `tabIndex=0` engine canvas.
- Preview and context canvases have `tabIndex=-1`.
- Parent-context SVG hit targets and breadcrumb segments are keyboard focusable.
- Enter on selected portal runs `enter-child-canvas`.
- Escape runs `go-to-parent-canvas` only if:
  - no drag is active;
  - resize mode is false;
  - no delete confirmation modal is open;
  - no text editing state is active.
- Delete/Backspace never navigate.

## Performance Budget

Constants:

```ts
MAX_LIVE_PORTAL_PREVIEWS = 8;
MAX_CONTEXT_ENGINES = 2;
MAX_TOTAL_ENGINES = 11;
MIN_PORTAL_PREVIEW_W = 24;
MIN_PORTAL_PREVIEW_H = 24;
PORTAL_PREVIEW_MAX_FPS = 20;
CONTEXT_ENGINE_MAX_FPS = 10;
ACTIVE_ENGINE_FRAME_BUDGET_MS = 16;
PREVIEW_TOTAL_FRAME_BUDGET_MS = 10;
```

Rules:

- Active engine renders normally.
- Embedded-live and preview-live engines mark dirty at most every `50ms`.
- Context-live engines mark dirty at most every `100ms`.
- If active engine frame budget is exceeded for three consecutive measured frames, demote portal previews by visible area until budget recovers.
- Dormant fallback is coarse geometry from `describeNode` and node bounds, not a stale fake canvas.
- Never mount more than `MAX_TOTAL_ENGINES`.

Measurement:

- Add required `onFrameMetrics` support to `EngineOptions`.
- Metrics include canvasId, mode, renderedNodes, totalNodes, frameMs.
- Probe asserts max engine count and verifies demotion path with an artificially low budget.

## Document Sample Fixtures

Add sample nested collection fixtures for probes only:

```ts
Root canvas:
  - source note
  - planning canvas portal -> planning canvas
  - sibling note above portal
  - sibling canvas portal to the right -> sibling canvas
  - sibling note bottom-left

Planning canvas:
  - three notes
  - one text node

Sibling canvas:
  - one note
```

Use deterministic ids:

```text
root
planning
sibling-canvas
portal-planning
portal-sibling
root-sibling-top
root-sibling-bottom-left
```

## Implementation Order

Follow this order exactly:

1. Add document collection types and pure model helpers.
2. Add document command planner with create, enter, parent, action routing, set-node-data, delete confirmation, and portal paste stripping.
3. Add `CanvasEngine` interaction modes, command guard, portal layout emission, public rect conversion, and frame metrics.
4. Update `canvasNodeDefinition` actions, hit testing, aperture helper, and portal preview render state.
5. Add `NestedCanvasWorkspace` with one active engine and no live portal overlays.
6. Replace `App.tsx` direct engine ownership with `NestedCanvasWorkspace`.
7. Add live portal overlay slots with embedded-live recursive viewports.
8. Add stack context planes.
9. Add parent-context border field.
10. Add delete confirmation modal and paste stripping integration.
11. Add nested canvas probe script and package script.
12. Update existing canvas foundation probe to keep passing with `NestedCanvasWorkspace`.
13. Run the full verification gate.

Do not start visual stack or parent-context field work before engine mode and command guard are implemented.

## Probe Requirements

Add `npm run probe:nested`.

`docs/nested-canvas-devtools-probe.js` must verify:

- root document collection has schemaVersion `1`;
- every canvas model has schemaVersion `2`;
- portal node uses `type: 'canvas'` and normalized `CanvasPortalNodeData`;
- live child engine canvas is mounted inside the portal overlay;
- portal preview canvas updates when child model changes;
- active engine and preview engine do not both receive the same pointer stream;
- keyboard commands go only to the active engine;
- Enter on selected portal enters child canvas;
- clicking portal overlay enters child canvas on double click;
- parent navigation returns to parent;
- returning selects the portal node;
- active child model changes do not mutate parent model accidentally;
- moving parent portal node does not mutate child model;
- per-canvas camera restore works;
- context parent plane appears after entering;
- animation-disabled mode reaches the same final state as animated mode;
- parent-context field renders projected shapes in all eight regions when fixtures exist;
- every projected parent-context shape is backed by a live clipped `CanvasEngine`;
- projected canvas neighbors with child documents render those child documents;
- projected non-canvas neighbors render non-empty one-node snippet canvases;
- projected canvas neighbors without child documents render non-empty portal snippet canvases;
- parent-context region assignment matches the documented angle buckets;
- projected portal activation moves sideways into sibling child canvas;
- projected non-portal activation returns to parent and selects that node;
- no `.halo-item` panel DOM exists and no visible text labels render inside `.parent-context-field`;
- copy/paste of portal strips `childCanvasId`;
- delete portal with child opens confirmation and does not delete before confirmation;
- confirm delete removes the portal and descendant documents;
- cancel delete leaves collection unchanged;
- performance budget demotes previews instead of active engine fidelity;
- no browser console errors except allowed Vite dev messages.

Existing `npm run probe:canvas` must continue to pass.

## Verification Gate

Every implementation phase must pass:

```bash
npm run build
npm audit --omit=dev
npm run probe:canvas
npm run probe:nested
git diff --check
rg -n "node\\.kind|node\\.label|node\\.detail|CanvasNodeKind" src scripts
rg -n "node\\.kind|node\\.label|node\\.detail|CanvasNodeKind" docs
```

Expected search result:

- no runtime source hits;
- docs hits only if explicitly historical or warning against the old model.

## Explicit Non-Implementation Items

Do not implement these in the first nested canvas release:

- true 3D camera;
- perspective tilt;
- collaborative editing;
- persistence/backend;
- deep duplicate of child canvas trees;
- cross-canvas backlinks;
- transclusion;
- AI-only hidden canvases;
- unlimited recursive engine mounting;
- activation overlays that block direct embedded canvas interaction;
- node definitions that instantiate engines.

## Completion Criteria

The nested canvas implementation is complete only when:

- `NestedCanvasWorkspace` owns document collection state and engine slots;
- `CanvasEngine` supports active, embedded-live, preview-live, context-live, and dormant modes;
- live child engines render inside visible portal overlays;
- only one engine owns edit focus at a time;
- portal action routing uses document commands;
- parent and child model mutation boundaries are proven by probe;
- 2.5D stack planes appear on enter;
- parent-context border field renders all eight regions using deterministic angle buckets;
- sideways navigation works through projected parent-context previews/shapes;
- copy/paste strips portal child references;
- portal deletion requires confirmation and handles descendant documents deterministically;
- performance limits cap mounted live engines;
- keyboard and nonvisual paths exist for enter, exit, preview focus, and parent-context navigation;
- `npm run build`, `npm run probe:canvas`, and `npm run probe:nested` pass.

## Implementation Callouts

Callout: live nested engines are host-owned.

Canvas nodes describe apertures and actions. They must not mount engines.

Callout: active focus is singular.

Multiple live engines can render. Only one receives edit commands.

Callout: parent context is eight-directional.

Do not collapse parent-neighbor context into floating cards, a right shelf, panel list, or breadcrumb.

Callout: preview live does not mean preview editable.

Portal preview canvases update visually, but direct editing starts only after the child canvas is promoted to active.

Callout: command boundaries are product boundaries.

Pointer, keyboard, nonvisual, and AI actions must all route through the same document and canvas command planners.
