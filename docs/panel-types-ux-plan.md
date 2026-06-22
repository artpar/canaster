# Panel Types UX Plan

Date: 2026-06-22

Purpose: decide the panel vocabulary before adding more canvas content types. Keep the user-facing language as **panels** and the engine language as **nodes**.

## Evidence

- Current built-in node types: `card`, `text`, `image`, `canvas`.
- Existing registry boundary: `src/engine/nodeTypes/*`; core canvas still owns geometry, selection, camera, snapping, copy/paste, and lifecycle.
- Existing work-items drawer lists nodes through `describeNode(...)` and routes node actions, but it does not yet create panels or edit type-specific data.
- `set-node-data` exists at the document-command layer, so type-specific editors should use that path instead of mutating node data directly.
- Real image rendering is not implemented yet; the image type is currently a placeholder.
- Daptin is already Canaster's backend. The repo guide documents `document.document_content` file-blob storage, production GCS-backed `cloud_store`, and schema-backed cloud-store blob columns for mail/outbox. Images should use the same Daptin-native storage pattern through an asset/media entity instead of waiting for a custom backend.
- Iframe embeds cannot be drawn by the canvas renderer itself. They need a DOM overlay layer, like live nested-canvas previews.
- External web constraints checked: iframe panels need sandbox/referrer/loading policy; image panels should use real alt text and object-fit style behavior.

## Panel Vocabulary

| User label | Engine type | Status | UX role |
|---|---:|---|---|
| Work item | `card` | exists | Short operational object with title, detail, and task/data/system accent. |
| Note | `text` | exists | Plain text or paragraph note. Do not split `text` and `paragraph` yet. |
| Image | `image` | exists, needs asset backing | Single visual reference with alt text and contain/cover fit. |
| View | `canvas` | exists | A child canvas portal; it is navigation, not just content. |
| Checklist | `check` | add next | Actionable todo/list panel for operational completion. |
| Embed | `embed` | add later | External web/media/document preview in a sandboxed DOM overlay. |
| Gallery | `gallery` | later | Multiple images; wait until the single-image panel is wired to Daptin assets. |

## Shared UX Rules

- A panel is a work object, not a decorative card.
- Canvas rendering stays compact: title/state first, details only when zoom and size allow.
- The work-items drawer becomes the plain-language inspector: select, edit content, toggle state, open actions.
- Creation should be a small **Add panel** popover from the toolbar, not a modal.
- Default placement: center of active viewport, snapped to grid, selected immediately.
- Type badges stay short: `WORK`, `NOTE`, `IMAGE`, `VIEW`, `LIST`, `WEB`.
- Internal entity/table/type ids stay under 9 characters. Keep readable names in labels, not identifiers.
- All panel data remains JSON-safe. Runtime loading/error state does not live in `node.data`.
- Media bytes do not live in `node.data`. Image panels store an asset reference plus display metadata; Daptin owns the file/blob row and cloud-store object.
- Empty states must be useful on-canvas: "Add an image source", "No checklist items", "Add view inside".

## Type UX

| Type | Canvas View | Inspector / Drawer | Empty / Error |
|---|---|---|---|
| Work item | Accent mark, title, 1-2 detail lines, semantic badge. | Title, detail, accent segmented control. | Untitled item with muted detail prompt. |
| Note | Plain text preview, line count in drawer. | Textarea with simple line wrapping; no rich text first pass. | `Empty note`; click/edit from drawer. |
| Image | Real thumbnail when asset is loaded; placeholder otherwise; fit badge only when needed. | Upload/select asset, alt text, caption, contain/cover control. | Missing asset, failed load, unsafe URL, missing alt. |
| View | Title plus live aperture/preview; action is open/create/focus. | Open view, preview here, rename title later. | No view inside; Add view inside. |
| Checklist | Title, done count, top 3-5 items, visible checked/unchecked boxes. | Add item, edit item text, toggle done, delete item; later reorder. | No checklist items; Add first item. |
| Embed | Static preview shell by default; live iframe only after explicit Interact. | URL, title, provider, sandbox status, Open original. | Unsupported URL, blocked load, permission needed. |

## Specific Next Panel: Checklist

Add `check` before `embed` as the next new panel type. Use `Checklist` only as the user-facing label.

Why:
- It fits Canaster's operational-work audience better than iframe-first.
- It uses the existing canvas renderer and JSON data model.
- It proves type-specific editing without the security and focus complexity of live embeds.
- Image and text already exist; checklist is the clearest missing work-native object.

This does not mean image storage waits. `image` is an existing type and should be promoted from placeholder to real media in the same product phase, before any `gallery` type.

## Make Image Real With Daptin

Use Daptin for image persistence. Do not put image bytes in the workspace JSON blob.

Proposed Daptin entity:

```yaml
Tables:
  - TableName: asset
    Columns:
      - Name: name
        DataType: varchar(300)
        ColumnType: label
      - Name: mime
        DataType: varchar(120)
        ColumnType: content
      - Name: file
        DataType: blob
        ColumnType: file
        IsForeignKey: true
        ForeignKeyData:
          DataSource: cloud_store
          Namespace: assets
          KeyName: img
```

Target image node data:

```ts
type ImageNodeData = {
  assetId: string | null;
  alt: string;
  fit: 'contain' | 'cover';
  caption?: string;
} & JsonObject;
```

Implementation notes:
- Add a Daptin `cloud_store` row such as `assets` backed by GCS.
- Add a schema file for `asset` with owner/private defaults and authenticated-user create/read/update through Daptin permissions.
- Add a frontend adapter next to `canasterDocuments.ts`, for example `assets.ts`, so React and node renderers never call raw Daptin APIs directly.
- Keep an in-browser object URL/cache for display only; the authoritative asset is the Daptin row plus cloud-store object.
- The canvas renderer should draw cached thumbnails only. Asset loading, object URL creation, and cache invalidation belong outside `imageNodeDefinition.render`.
- Store `assetId`, `alt`, `fit`, and optional caption in the canvas node. Store file bytes, MIME type, size, and storage path in Daptin.
- Gallery can then be a thin composition over multiple asset refs, not a separate storage problem.

Checklist data:

```ts
type CheckNodeData = {
  title: string;
  items: Array<{
    id: string;
    text: string;
    checked: boolean;
  }>;
} & JsonObject;
```

First-pass behavior:
- `displayName`: `Checklist`
- `defaultSize`: `280x180`
- `minSize`: `180x110`
- `createDefaultData`: title `Checklist`, empty `items`
- `render`: title, `2/5 done`, first visible items, checkbox marks, `LIST` badge
- `describe`: label title, role `Checklist`, detail `2 of 5 done`
- `parseData`: drop malformed items, preserve valid JSON strings/booleans, cap first render to visible rows
- `hitTest`: omit direct item toggles in v1 unless param-bearing node actions are added
- Inspector actions: add item, edit text, toggle item, delete item through `set-node-data`

Implementation phases:

1. Add registry type only: `BuiltInNodeTypes.check`, `checkNode.ts`, valid/malformed fixtures.
2. Add creation path: toolbar **Add panel** popover with Work item, Note, Image, View, Checklist.
3. Add inspector editing: selected checklist editor in work-items drawer using `set-node-data`.
4. Add direct canvas toggles only after node actions can carry an item id cleanly.

Acceptance:
- Checklist panels render normal and compact without crashing.
- Malformed checklist data renders as an empty checklist.
- Copy/paste deep-clones items and creates fresh node ids.
- Work-items drawer can toggle items without bypassing document commands.
- Keyboard/nonvisual users can select the checklist and toggle items in the drawer.

## Embed Later

Embed should be planned as a DOM-overlay panel, not as a pure canvas renderer.

Data sketch:

```ts
type EmbedNodeData = {
  url: string | null;
  title: string;
  provider: 'web' | 'video' | 'map' | 'doc';
  aspectRatio: '16:9' | '4:3' | 'auto';
} & JsonObject;
```

UX rules:
- Default to static preview so iframe content does not steal pan/zoom.
- Require an explicit **Interact** action to enable the live iframe.
- Use `loading="lazy"`, restrictive `sandbox`, explicit `allow`, and `referrerPolicy`.
- Block `javascript:`, `data:`, `file:`, and unsafe non-HTTPS URLs outside local dev.
- Show provider/title/domain on canvas; keep full URL in inspector.

## Do Not Do Yet

- Do not add separate `paragraph` type; it is `text`.
- Do not add gallery before the Daptin-backed single-image panel and thumbnail cache exist.
- Do not let node definitions own DOM overlays or async image/iframe side effects.
- Do not add direct checklist row hit-testing with encoded action strings if the command payload shape is still missing.
- Do not expose sandbox flags as casual user controls.
