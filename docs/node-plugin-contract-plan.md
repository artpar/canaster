# Node Plugin Technical Architecture Plan

Date: 2026-06-15

Purpose: this is the concrete implementation plan for pluggable Canway node types. It replaces the earlier conceptual contract. Follow this document for the real implementation.

## Fixed Decisions

These decisions are final for the first implementation:

- Use a first-party in-repo node type registry.
- Do not load third-party/runtime plugins yet.
- Do not add a compatibility layer for the current `CanvasNode.kind` model. Migrate the sample model and source in one change.
- Add `schemaVersion: 2` to the root canvas model in the same migration.
- Do not add full rich-text editing in the first pass. Text nodes are plain text.
- Do not run nested canvas engines inside canvas-node previews.
- Do not let node types own movement, resize, selection, camera, snapping, lifecycle, or model-change emission.
- Do not create separate mutation paths for pointer, keyboard, nonvisual, or AI edits.
- Every node data shape must be JSON-serializable.
- Every registered node definition must validate/normalize data through `parseData`.
- Unknown node types must render safely and remain selectable/movable/deletable.
- Malformed known-node data must not crash render, hit-test, description, copy/paste, or node panel.
- Phase 2 must not expose internal plugin action buttons or activate hit targets. Action routing starts in Phase 4.

## Target File Structure

Create these files in Phase 2:

```text
src/engine/nodeTypes/
  types.ts
  registry.ts
  rendering.ts
  data.ts
  safety.ts
  cardNode.ts
  unknownNode.ts
```

Create these files in Phase 3:

```text
src/engine/nodeTypes/
  textNode.ts
  imageNode.ts
  canvasNode.ts
```

Keep these existing files as owners:

```text
src/engine/types.ts              public model, commands, operations, status types
src/engine/CanvasEngine.ts       canvas interaction, command planning, rendering orchestration
src/App.tsx                      React app shell and node panel
docs/canvas-foundation-devtools-probe.js
scripts/run-canvas-foundation-probe.mjs
```

Do not introduce React components inside `src/engine/nodeTypes/` in the first implementation. Node definitions are pure engine-level descriptors and render functions.

## Target Model Types

Update `src/engine/types.ts` to replace the current `kind/label/detail` node shape.

Final shape:

```ts
export const BuiltInNodeTypes = {
  card: 'card',
  text: 'text',
  image: 'image',
  canvas: 'canvas',
} as const;

export type BuiltInNodeType = (typeof BuiltInNodeTypes)[keyof typeof BuiltInNodeTypes];
export type NodeTypeId = string;

export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export type NodeData = JsonObject;

export type CanvasModel = {
  schemaVersion: 2;
  nodes: CanvasNode[];
};

export type CanvasNode<TData extends NodeData = NodeData> = {
  id: string;
  type: NodeTypeId;
  x: number;
  y: number;
  w: number;
  h: number;
  data: TData;
};

export type CardAccent = 'task' | 'data' | 'system';
export type CardNodeData = {
  title: string;
  detail: string;
  accent: CardAccent;
} & JsonObject;

export type TextNodeData = {
  text: string;
} & JsonObject;

export type ImageNodeData = {
  src: string | null;
  alt: string;
  fit: 'contain' | 'cover';
} & JsonObject;

export type CanvasPortalNodeData = {
  childCanvasId: string | null;
  title: string;
  nodeCount: number;
} & JsonObject;
```

Important callout:

- `x`, `y`, `w`, `h`, `id`, and `type` are core-owned.
- `data` is node-definition-owned.
- Do not keep `kind`, `label`, or `detail` on the base node.
- Do not put selection, camera, parent canvas, or runtime loading state into `data`.
- `NodeData` is intentionally JSON-shaped, not a discriminated union. Type safety comes from `NodeDefinition.parseData`, not from trusting `CanvasNode.type`.
- Unknown nodes do not wrap raw data into `UnknownNodeData`; `unknownNodeDefinition` receives `node.type` and raw `node.data` directly.

## Node Definition Interfaces

Add this to `src/engine/nodeTypes/types.ts`.

```ts
import type { CanvasNode, JsonObject, NodeData, NodeTypeId, WorldPoint } from '../types';
import type { CanvasTheme } from '../theme';

export type NodeSize = {
  w: number;
  h: number;
};

export type NodeContentRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type NodeRenderQuality = 'normal' | 'compact';

export type NodeRenderState = {
  selected: boolean;
  primary: boolean;
  hovered: boolean;
  quality: NodeRenderQuality;
};

export type NodeRenderContext<TData extends NodeData = NodeData> = {
  ctx: CanvasRenderingContext2D;
  node: CanvasNode & { data: TData };
  data: TData;
  theme: CanvasTheme;
  contentRect: NodeContentRect;
  state: NodeRenderState;
};

export type NodeHitTarget =
  | { type: 'body' }
  | { type: 'activate'; action: string };

export type NodeHitTestContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
  point: WorldPoint;
  contentRect: NodeContentRect;
};

export type NodeDescription = {
  label: string;
  roleDescription: string;
  details: string[];
  state: string[];
  actions: NodeActionDescriptor[];
};

export type NodeActionDescriptor = {
  id: string;
  label: string;
  available: boolean;
  disabledReason?: string;
};

export type NodeDescribeContext<TData extends NodeData = NodeData> = {
  node: CanvasNode & { data: TData };
  data: TData;
};

export type NodeDefinition<TData extends NodeData = NodeData> = {
  type: NodeTypeId;
  displayName: string;
  defaultSize: NodeSize;
  minSize: NodeSize;
  createDefaultData(): TData;
  parseData(raw: JsonObject): TData;
  render(context: NodeRenderContext<TData>): void;
  hitTest?(context: NodeHitTestContext<TData>): NodeHitTarget | null;
  describe(context: NodeDescribeContext<TData>): NodeDescription;
};
```

No `planCommand` hook in the first implementation.

Reason: command planning stays centralized in `CanvasEngine` until the registry is stable. Type-specific commands can be added after card/text/image/canvas rendering and description work is proven.

`parseData` is mandatory. It must return valid defaulted data for malformed input and must never throw for user/model data. This is the narrowing boundary between `CanvasNode.type` and `CanvasNode.data`.

Action descriptors exist for future metadata, but Phase 2 and Phase 3 definitions must return `actions: []`. Phase 4 is the first phase allowed to expose actionable descriptors in the UI.

## Registry Implementation

Add `src/engine/nodeTypes/registry.ts`.

Phase 2 registry:

```ts
import type { CanvasNode } from '../types';
import type { NodeDefinition } from './types';
import { cardNodeDefinition } from './cardNode';
import { unknownNodeDefinition } from './unknownNode';

const definitions = createRegistry([cardNodeDefinition]);

function createRegistry(items: NodeDefinition[]) {
  const map = new Map<string, NodeDefinition>();
  for (const definition of items) {
    if (!definition.type.trim()) throw new Error('Node type id cannot be empty');
    if (map.has(definition.type)) throw new Error(`Duplicate node type: ${definition.type}`);
    map.set(definition.type, definition);
  }
  return map;
}

export function nodeDefinitionFor(node: CanvasNode): NodeDefinition {
  return definitions.get(node.type) ?? unknownNodeDefinition;
}

export function registeredNodeDefinitions(): NodeDefinition[] {
  return [...definitions.values()];
}
```

Phase 3 registry change:

```ts
import { canvasNodeDefinition } from './canvasNode';
import { imageNodeDefinition } from './imageNode';
import { textNodeDefinition } from './textNode';

const definitions = createRegistry([
  cardNodeDefinition,
  textNodeDefinition,
  imageNodeDefinition,
  canvasNodeDefinition,
]);
```

Registry policy:

- Registry is static and first-party only.
- Unknown type uses `unknownNodeDefinition`.
- Do not throw on unknown node type during render, hit-test, or description.
- Duplicate registered type ids throw during module initialization.
- Empty or whitespace-only registered type ids throw during module initialization.
- The registry must expose safe wrapper helpers so the engine does not call plugin methods directly:
  - `parseNodeData(node)`;
  - `renderNodeContent(context)`;
  - `hitTestNodeContent(context)`;
  - `describeNode(node)`.

Safe wrapper behavior:

- `parseNodeData` calls definition `parseData`; if that throws, use `definition.createDefaultData()`; if that also throws, use `unknownNodeDefinition`.
- `parseNodeData` must only receive `JsonObject`. If model input provides `null`, an array, or a primitive as `data`, core must coerce it to `{}` before calling the definition.
- `renderNodeContent` catches renderer errors and renders `unknownNodeDefinition` content inside the same shell.
- `hitTestNodeContent` catches errors and returns `{ type: 'body' }`.
- `describeNode` catches errors and returns an unknown-node description.
- Safe wrappers must be the only call site for `parseData`, `render`, `hitTest`, and `describe` outside node definition tests.

## Shared Utility Ownership

Add `src/engine/nodeTypes/rendering.ts`.

Allowed exports:

- `clipText(ctx, text, maxWidth)`;
- `wrapText(ctx, text, maxWidth, maxLines)`;
- `drawPlaceholderIcon(ctx, rect, label)`;
- `drawTypeBadge(ctx, rect, label, theme)`;
- `contentLineCapacity(rect, lineHeight)`.

Do not import helpers from `CanvasEngine` into node definitions.

Add `src/engine/nodeTypes/data.ts`.

Allowed exports:

- `asString(value, fallback)`;
- `asNumber(value, fallback)`;
- `asNullableString(value)`;
- `asEnum(value, allowed, fallback)`;
- `asJsonObject(value)`;
- `cloneNodeData(data)`;
- `assertJsonValue(value)`.

`cloneNodeData(data)` must preserve unknown node data exactly when it is JSON-safe.

Implementation:

```ts
export function cloneNodeData<T extends NodeData>(data: T): T {
  assertJsonValue(data);
  return JSON.parse(JSON.stringify(data)) as T;
}
```

Use JSON clone instead of `structuredClone` in Phase 2 because JSON-serializability is the explicit storage contract. If JSON clone fails, the operation must fail loudly in development and be covered by probes.

Add `src/engine/nodeTypes/safety.ts`.

Allowed exports:

- safe render wrapper;
- safe describe wrapper;
- safe hit-test wrapper;
- malformed data fallback helpers.

The engine should call the safety wrappers, not raw plugin methods.

## Node Type Definitions

### Card Node

File: `src/engine/nodeTypes/cardNode.ts`

Model:

```ts
type CardNodeData = {
  title: string;
  detail: string;
  accent: 'task' | 'data' | 'system';
};
```

Definition values:

- `type`: `card`
- `displayName`: `Card`
- `defaultSize`: `{ w: 256, h: 128 }`
- `minSize`: `{ w: 140, h: 76 }`

Rendering:

- Move current title/detail/accent rendering from `CanvasEngine.drawNode` into `cardNodeDefinition.render`.
- Use the existing theme kind colors through a helper that maps `accent` to `theme.kind[accent]`.
- Preserve compact rendering behavior: in compact mode, draw the accent strip and skip detail text.
- Draw type badge and empty/default title state inside the content renderer. Core does not know card fields.

Data parsing:

- `parseData` returns `title`, `detail`, and `accent`.
- `title`: `asString(raw.title, 'Untitled card')`;
- `detail`: `asString(raw.detail, '')`;
- `accent`: `asEnum(raw.accent, ['task', 'data', 'system'], 'task')`.
- Malformed input such as `null`, `{ title: 42 }`, or `{ accent: 'unknown' }` renders as a normalized card, not as an exception.

Description:

- label: card title;
- roleDescription: `Card`;
- details: accent, rounded position, rounded size, detail text;
- actions: `[]` until Phase 4.

### Text Node

File: `src/engine/nodeTypes/textNode.ts`

Model:

```ts
type TextNodeData = {
  text: string;
};
```

Definition values:

- `type`: `text`
- `displayName`: `Text`
- `defaultSize`: `{ w: 240, h: 140 }`
- `minSize`: `{ w: 140, h: 76 }`

Rendering:

- Draw first lines of plain text inside content rect.
- Use existing `wrapText`-equivalent helper moved to shared engine utility or copied into node type helper module.
- In compact mode, draw `TEXT` label and first clipped line only.
- Empty state text: `Empty text`.

Data parsing:

- `parseData` returns `{ text }`.
- `text`: `asString(raw.text, '')`.
- Do not infer text from markdown-specific or unknown fields. `{ markdown: '# hello' }` becomes an empty text node until an explicit conversion command exists.

Description:

- label: first non-empty line, clipped to 60 chars; if empty, `Empty text node`;
- roleDescription: `Text`;
- details: line count and rounded size;
- actions: `[]` until Phase 4.

Explicit non-goal:

- No in-canvas rich text editor.
- No markdown rendering.
- No text cursor/caret in first implementation.

### Image Node

File: `src/engine/nodeTypes/imageNode.ts`

Model:

```ts
type ImageNodeData = {
  src: string | null;
  alt: string;
  fit: 'contain' | 'cover';
};
```

Definition values:

- `type`: `image`
- `displayName`: `Image placeholder`
- `defaultSize`: `{ w: 280, h: 180 }`
- `minSize`: `{ w: 140, h: 96 }`

Rendering first implementation:

- Do not load external images yet.
- If `src` is null, draw placeholder image frame.
- If `src` is non-null, draw placeholder frame with `Image source set; preview loading not implemented yet.` and clipped source host/path text.
- Draw `IMAGE` type label.
- In compact mode, draw icon-like rectangle and `IMAGE`.

Data parsing:

- `parseData` returns `src`, `alt`, and `fit`.
- `src`: `asNullableString(raw.src)`;
- `alt`: `asString(raw.alt, '')`;
- `fit`: `asEnum(raw.fit, ['contain', 'cover'], 'contain')`.
- Malformed input such as `{ src: 42 }` renders as no-source placeholder content.

Description:

- label: alt text if present, otherwise `Image node`;
- roleDescription: `Image`;
- details: source status, preview-loading status, fit mode, rounded size;
- actions: `[]` until Phase 4.

Explicit callout:

- Real image loading requires an asset/cache layer. Do not add ad hoc `new Image()` side effects in `render`.

### Canvas Node

File: `src/engine/nodeTypes/canvasNode.ts`

Model:

```ts
type CanvasPortalNodeData = {
  childCanvasId: string | null;
  title: string;
  nodeCount: number;
};
```

Definition values:

- `type`: `canvas`
- `displayName`: `Canvas`
- `defaultSize`: `{ w: 300, h: 180 }`
- `minSize`: `{ w: 160, h: 100 }`

Rendering:

- Draw title.
- Draw portal indicator label `CANVAS`.
- Draw child node count.
- Draw lightweight preview boxes only; no nested engine.
- If `childCanvasId` is null, draw `No child canvas`.

Data parsing:

- `parseData` returns `childCanvasId`, `title`, and `nodeCount`.
- `childCanvasId`: `asNullableString(raw.childCanvasId)`;
- `title`: `asString(raw.title, 'Canvas')`;
- `nodeCount`: clamp `asNumber(raw.nodeCount, 0)` to an integer `>= 0`.

Hit test:

- Phase 3 must not return activate targets. Return `{ type: 'body' }` or null only.
- Phase 4 may return `{ type: 'activate', action: 'create-child-canvas' }` only after generic action command dispatch exists.
- Phase 5 may return `{ type: 'activate', action: 'enter-child-canvas' }` only after nested canvas navigation commands exist.

Description:

- label: title or `Canvas node`;
- roleDescription: `Canvas portal`;
- details: child canvas id state and node count;
- actions: `[]` until Phase 4.

### Unknown Node

File: `src/engine/nodeTypes/unknownNode.ts`

Model:

Use existing `CanvasNode.data` without trusting shape.

Definition values:

- `type`: `unknown`
- `displayName`: `Unknown`
- `defaultSize`: `{ w: 220, h: 120 }`
- `minSize`: `{ w: 140, h: 76 }`

Rendering:

- Draw safe warning-style content within normal node shell.
- Show `UNKNOWN`.
- Show the raw `node.type`, clipped.
- Do not throw if `data` is malformed.

Description:

- label: `Unknown node type <type>`;
- roleDescription: `Unknown node`;
- details: type id and size;
- actions: none.

Data parsing:

- `parseData` returns the raw JSON object unchanged.
- If raw data is not an object, use `{}`.
- Do not wrap raw data in `UnknownNodeData`.

## CanvasEngine Refactor

Update `CanvasEngine.drawNode`.

Target structure:

```ts
private drawNode(node: CanvasNode, compact: boolean) {
  const renderNode = this.renderNode(node);
  const definition = nodeDefinitionFor(renderNode);
  const data = parseNodeData(renderNode);
  const selected = this.selectedNodeIds.has(renderNode.id);
  const primary = renderNode.id === this.primarySelectedNodeId;
  const hovered = renderNode.id === this.hoverNodeId;

  this.drawNodeShell(renderNode, { selected, primary, hovered, compact });
  const contentRect = this.nodeContentRect(renderNode);
  this.ctx.save();
  this.clipToNodeContent(contentRect);
  renderNodeContent({
    definition,
    ctx: this.ctx,
    node: renderNode,
    data,
    theme: this.theme,
    contentRect,
    state: {
      selected,
      primary,
      hovered,
      quality: compact ? 'compact' : 'normal',
    },
  });
  this.ctx.restore();
  if (primary) this.drawResizeHandle(renderNode);
}
```

Required helper split:

- `drawNodeShell(node, state)`;
- `drawResizeHandle(node)`;
- `nodeContentRect(node)`;
- `clipToNodeContent(rect)`;
- `nodeDefinitionFor(node)`.

Move these existing helpers out of card-only rendering:

- `wrapText`;
- `clipText`;
- `detailLineCapacity` can become card-specific.

Keep current outer shell visual in core for now. Do not let definitions draw selection strokes or resize handles.

Content contract:

- `contentRect` is in world coordinates.
- `ctx` is already transformed to world space by the engine.
- Definitions must not assume a local node origin at `(0, 0)`.
- Definitions may call `ctx.save()`, translate, clip, or change styles only if they restore before returning.
- Definitions must not draw outside `contentRect` intentionally. Core clips before calling them, but definitions still own clean layout inside the rect.
- Core owns shell fill, shell stroke, selection stroke, hover state, resize handles, snap guides, drag previews, and node bounds.
- Definitions own content-only visuals: text, placeholders, type badges, accent strips, internal empty states, and internal future affordances.

Sizing policy:

- Node creation uses `definition.defaultSize`.
- Core resize clamps to `definition.minSize`.
- Existing nodes smaller than `definition.minSize` render as-is until the user resizes them or a future explicit normalize-size command is run.
- Do not silently mutate model dimensions during render, parse, describe, or hit-test.

## Hit Testing Refactor

Keep base hit testing in core:

- resize handle;
- node rectangle;
- background.

Add plugin affordance hit test after base node hit:

```ts
private nodeInternalHit(node: CanvasNode, point: WorldPoint) {
  const definition = nodeDefinitionFor(node);
  const data = parseNodeData(node);
  return hitTestNodeContent({
    definition,
    node,
    data,
    point,
    contentRect: this.nodeContentRect(node),
  });
}
```

First implementation behavior:

- Body hit selects/drags as today.
- Phase 2 and Phase 3 definitions must not return `activate`.
- Phase 2 and Phase 3 `hitTestNodeContent` returns only `{ type: 'body' }` or null.
- Phase 4 introduces generic action dispatch: internal `activate` hit target becomes a command lookup by action id.
- If an action is unavailable, the dispatcher must not run a command and must announce/use the action `disabledReason`.
- Phase 5 connects `enter-child-canvas` to nested canvas navigation commands.

Do not let plugin hit test bypass selection or drag ownership.
Do not render an affordance that has no routed command or disabled state.

## App/Node Panel Refactor

Update `src/App.tsx` node panel to use node descriptions.

Add a pure helper, preferably in `src/engine/nodeTypes/registry.ts` or `src/engine/nodeTypes/descriptions.ts`:

```ts
export function describeNode(node: CanvasNode): NodeDescription {
  const definition = nodeDefinitionFor(node);
  const data = parseNodeData(node);
  return describeNodeContent({ definition, node, data });
}
```

Panel rules:

- Use `description.label` as the primary row text.
- Use `description.roleDescription` where current UI shows kind.
- Render `description.details` as metadata.
- Render `description.actions` as buttons only after action command plumbing exists. For first registry migration, display descriptions only and keep existing core action toolbar.
- Phase 2 and Phase 3 definitions return `actions: []`, so no dead panel buttons exist.

Do not hardcode card fields in the panel after migration.

Accessibility and keyboard rules:

- Selected-node announcement uses `describeNode(node).label` and `describeNode(node).roleDescription`.
- Copied, pasted, deleted, moved, and resized status messages use `describeNode` instead of direct model fields.
- Unknown nodes announce safely through `describeNode`.
- Keyboard selection, keyboard movement, delete, copy, and paste behavior must remain core-owned and type-agnostic.
- Replacing `kind/label/detail` must not remove existing keyboard shortcuts or node access panel focus behavior.

## Command And Operation Changes

Phase 2 registry migration does not need new commands.

Phase 3 data migration needs one operation:

```ts
export type CanvasOperation =
  | ...
  | { type: 'set-node-data'; nodeId: string; from: NodeData; to: NodeData };
```

Only add `set-node-data` when implementing text/image/canvas data changes. Do not add it during card-only migration unless a command actually mutates data.

Future commands to add with their owning phase:

- `create-node`: text/image/canvas creation phase.
- `change-node-type`: explicit conversion phase, not first pass.
- `set-text-content`: text editing phase.
- `set-image-source`: image asset phase.
- `create-child-canvas`: nested canvas phase.
- `enter-child-canvas`: nested canvas phase, navigation command.
- `go-to-parent-canvas`: nested canvas phase, navigation command.

Callout:

- Navigation commands may update app navigation state rather than model. They still must be explicit commands, not ad hoc UI state mutation.

Data cloning and JSON enforcement:

- Copy/paste clones node `data` with `cloneNodeData`.
- Unknown node data is preserved exactly when JSON-safe.
- `assertJsonValue(node.data)` runs in development/probe paths for sample model creation, node creation, `set-node-data`, copy, paste, and registry default data.
- If `assertJsonValue` finds `Date`, `Map`, `Image`, functions, class instances, `undefined`, `NaN`, or `Infinity`, the operation fails loudly in development. Do not coerce those values silently.
- Runtime render/describe/hit-test remains safe even if malformed data reaches the engine.

## Sample Model Migration

Update `src/engine/sampleModel.ts`.

Current node:

```ts
{
  id: 'source',
  label: 'Source Model',
  detail: '...',
  kind: 'data',
  x, y, w, h
}
```

Target node:

```ts
{
  id: 'source',
  type: 'card',
  x, y, w, h,
  data: {
    title: 'Source Model',
    detail: '...',
    accent: 'data'
  }
}
```

No runtime migration helper. This repo has no persisted production data yet, so migrate fixtures and code atomically.

Model version boundary:

- All root models in source, tests, probes, and docs must include `schemaVersion: 2`.
- `CanvasEngine` and app setup accept only v2 models after this migration.
- Do not auto-upgrade v1 `kind/label/detail` models at runtime.
- If local experiments or copied snapshots still contain v1 data, they must be manually converted before use.
- Future persistence work must add a real migration module before accepting multiple schema versions.

## TypeScript Migration Order

Implement in this exact order:

1. Add node type files with interfaces and definitions.
2. Update `CanvasNode` and related data types in `src/engine/types.ts`.
3. Update `sampleModel.ts` to `type: 'card'` and `data`.
4. Update `CanvasEngine` compile errors:
   - replace `node.kind` usages with card definition rendering;
   - replace `node.label` usages with `describeNode(node).label`;
   - replace `node.detail` usages inside card renderer;
   - update all test/probe direct model construction.
5. Update `App.tsx` node panel to use `describeNode`.
6. Update probe fixtures in `docs/canvas-foundation-devtools-probe.js`.
7. Run `npm run build`.
8. Run `npm run probe:canvas`.
9. Update phase status docs after code/probe pass.

## Probe Update Requirements

Update `docs/canvas-foundation-devtools-probe.js` and `scripts/run-canvas-foundation-probe.mjs`.

Required assertions for Phase 2 registry migration:

- app renders all sample card nodes;
- node access panel labels still include `Source Model`;
- card node selection/move/resize/delete/copy/paste pass existing assertions;
- compact rendering with 1,000 and 2,000 card nodes still passes;
- unknown node fixture renders without errors;
- unknown node is selectable;
- unknown node can move and delete through core commands;
- unknown node can copy/paste with JSON-safe custom data preserved exactly;
- unknown node appears in node access panel with role `Unknown node`;
- malformed known card fixture renders without errors and appears in the panel;
- no source path reads `node.kind`, `node.label`, or `node.detail` outside card migration code.

Required malformed fixtures:

```ts
{ id: 'bad-card-null', type: 'card', data: null as never, x: 0, y: 0, w: 180, h: 90 }
{ id: 'bad-card-accent', type: 'card', data: { title: 42, accent: 'bad' } as never, x: 0, y: 0, w: 180, h: 90 }
```

Required assertions for Phase 3 definitions:

- text node renders and describes valid plain text;
- malformed text node `{ markdown: '# hello' }` renders as empty text node;
- image node with `src: null` renders no-source placeholder;
- malformed image node `{ src: 42 }` renders no-source placeholder;
- image node with string `src` renders `Image source set; preview loading not implemented yet.`;
- canvas node renders portal placeholder;
- canvas node does not expose activate hits or actions in Phase 3;
- text/image/canvas nodes are selectable, movable, resizable, deletable, copyable, and pasteable;
- copied/pasted data is JSON-cloned, not shared by reference.

Add this search check during implementation:

```bash
rg -n "node\\.kind|node\\.label|node\\.detail|CanvasNodeKind" src scripts
rg -n "node\\.kind|node\\.label|node\\.detail|CanvasNodeKind" docs --glob '!docs/node-plugin-contract-plan.md'
```

Expected after migration:

- no runtime source hits;
- docs may contain historical references only if clearly marked historical.

## Implementation Phases

### Phase 1: Documentation Only

Status: this document.

No runtime changes.

### Phase 2: Registry With Card And Unknown Nodes

Status: implemented on 2026-06-15.

Goal: introduce the node definition boundary without changing visible behavior.

Files changed:

- `src/engine/types.ts`
- `src/engine/sampleModel.ts`
- `src/engine/CanvasEngine.ts`
- `src/App.tsx`
- `src/engine/nodeTypes/types.ts`
- `src/engine/nodeTypes/registry.ts`
- `src/engine/nodeTypes/rendering.ts`
- `src/engine/nodeTypes/data.ts`
- `src/engine/nodeTypes/safety.ts`
- `src/engine/nodeTypes/cardNode.ts`
- `src/engine/nodeTypes/unknownNode.ts`
- probe files

Do not add text/image/canvas node UI in Phase 2.

Acceptance:

- existing app looks the same for card nodes;
- unknown nodes are safe;
- malformed card data is safe;
- model root uses `schemaVersion: 2`;
- docs document registry boundary and card/unknown behavior;
- full verification gate passes.

### Phase 3: Add Text, Image, Canvas Definitions

Status: implemented on 2026-06-15.

Goal: add definitions without advanced editing.

Files added:

- `textNode.ts`
- `imageNode.ts`
- `canvasNode.ts`

Add sample/probe-only fixtures for each type. Do not add toolbar creation UI yet.

Acceptance:

- each type renders;
- each type appears in node panel;
- each type is selectable/movable/resizable/deletable/copyable/pasteable;
- no type-specific editing yet.
- text/image/canvas malformed data probes pass;
- image placeholder copy explicitly says preview loading is not implemented when `src` is set;
- docs document text/image/canvas definitions and non-goals.

### Phase 4: Type-Specific Actions

Status: future work.

Goal: add declarative actions and command plumbing.

Add:

- node description actions rendered in panel;
- `set-node-data`;
- `set-text-content`;
- `set-image-source`;
- `create-child-canvas`.

Acceptance:

- actions route through commands;
- no plugin mutates model directly;
- probe verifies action metadata and at least one action per type;
- docs document the action routing pipeline and disabled-state behavior.

### Phase 5: Nested Canvas Integration

Status: future work.

Goal: implement the UX in `docs/nested-canvas-ux-plan.md`.

Add:

- `CanvasDocument` model;
- active canvas id;
- breadcrumb;
- per-canvas camera memory;
- `enter-child-canvas`;
- `go-to-parent-canvas`.

Acceptance:

- nested canvas probe requirements pass;
- parent/child model boundaries are proven;
- docs document the nested canvas model and navigation commands.

## Adding A First-Party Node Type Checklist

A new first-party node type is complete only after all of these are done:

- Add one definition file in `src/engine/nodeTypes/`.
- Add one registry entry.
- Add `BuiltInNodeTypes` constant if the type is first-party and stable.
- Define `defaultSize` and `minSize`.
- Define `createDefaultData`.
- Define `parseData` with malformed-data behavior.
- Define `render` for normal and compact quality.
- Define `describe` for nonvisual and panel use.
- Define `hitTest` only if there is routed command behavior; otherwise omit it.
- Add a probe fixture for valid data.
- Add a probe fixture for malformed known data.
- Add copy/paste JSON clone coverage.
- Add docs describing data shape, non-goals, and action behavior.
- Add creation UI only when the type is intended for user creation.
- Add action descriptors only when command routing for those actions exists.

## Explicit Non-Implementation Items

Do not implement these while doing Phase 2 or Phase 3:

- external npm/plugin marketplace;
- dynamic import of plugins;
- plugin sandboxing;
- rich text editor;
- image upload/cache;
- nested engine preview;
- undo/redo;
- collaboration;
- persistence migration;
- cross-canvas links.

These require separate plans.

## Verification Gate

Every implementation phase must pass:

```bash
npm run build
npm audit --omit=dev
npm run probe:canvas
git diff --check
rg -n "node\\.kind|node\\.label|node\\.detail|CanvasNodeKind" src scripts
rg -n "node\\.kind|node\\.label|node\\.detail|CanvasNodeKind" docs --glob '!docs/node-plugin-contract-plan.md'
```

For Phase 2 and later, the `rg` commands must have no runtime source hits and no unmarked docs hits.

## Final Acceptance Criteria

The node plugin architecture is complete only when:

- `CanvasEngine` does not contain card/text/image/canvas rendering branches;
- all render content comes from node definitions;
- all nonvisual descriptions come from node definitions;
- unknown node type is safe and probed;
- adding a node type follows the full first-party checklist, not only one file and one registry entry;
- adding a node type does not change pointer/keyboard/touch movement, resize, selection, or camera logic;
- every mutation still goes through commands and operations;
- malformed known-node data is safe and probed;
- copy/paste uses JSON-safe cloning for all node data;
- Phase 2 and Phase 3 expose no dead action buttons or activate hit targets;
- probe covers card, text, image, canvas, and unknown nodes;
- docs explain the implemented boundary.

## Implementation Callouts

Callout: keep the core boring.

The core should know that a node has a type and data. It should not know that a card has detail text or that an image has a source except through the definition.

Callout: first-party registry is enough.

Do not build a plugin marketplace or runtime loader until first-party node types prove the boundary.

Callout: no fallback legacy model.

Because there is no production persistence in this repo, migrate the model shape atomically. Do not carry `kind/label/detail` compatibility code.

Callout: unknown node is required, not optional.

Unknown node behavior is the safety net that prevents plugin/type mistakes from crashing the canvas.

Callout: AI uses the same registry.

AI-native behavior depends on machine-readable type definitions. Do not create AI-only metadata outside the registry.
