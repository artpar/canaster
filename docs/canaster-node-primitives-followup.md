# Canaster Node Primitives Follow-up

Date: 2026-06-29

Purpose: capture candidate node primitives and workspace experiences that should be considered after the current `src/ui/canvas/nodeTypes` polish. This is not an implementation plan. It records product pressure, current source constraints, and the questions that must be answered before new primitives are added.

## Grounded Facts

- `src/ui/canvas/nodeDefinition/nodeTypeSpecs.ts` currently defines five built-in user-facing node types: work item, note, image, view, and checklist.
- `src/domain/BuiltInNodeTypes.ts` is the domain-facing list of built-in type identifiers. Adding a built-in primitive touches a public model contract.
- `src/ui/canvas/nodeRegistry.ts` owns UI registration, parsing, rendering, hit testing, nonvisual descriptions, portal data, paste behavior, and asset references for node definitions.
- `src/ui/canvas/CanvasEngine.ts` renders node shells and delegates content rendering and interaction regions through the node definition API.
- `src/domain/nodeSemantics.ts` mirrors node data normalization and descriptions outside the UI registry. A new built-in primitive needs both UI and domain semantics kept coherent.
- `DESIGN.md` requires compact canvas nodes, 8px node radius, functional color, practical product language, and no decorative canvas flourishes.
- `PRODUCT.md` says Canaster is for practical operational documents, not a generic whiteboard, developer diagramming tool, BI dashboard, or novelty mind-map app.

## Decision Rules

Before adding a primitive, answer these questions from source:

1. Why is an existing node type insufficient?
2. Where does the data belong: existing node `data`, new node type, document metadata, asset reference, or workspace view state?
3. When does the user need this on the canvas instead of inside the right-side panel?
4. What should not be added because it would make Canaster feel like a dashboard, database, diagram tool, or generic whiteboard?
5. Why not defer it to `node-plugin-contract-plan.md` instead of making it a built-in?

## Candidate Primitives

### Work Item State

What: add explicit work state to work items: not started, active, blocked, done. This could later support filters, panel grouping, and nonvisual state text.

Why: the current work item `accent` is task/data/system type language, not progress. Overloading accent for progress would mix object kind with workflow state and make color carry too much meaning.

Where: start as `cardNode` data only after deciding migration behavior for existing saved workspaces. Rendering belongs in `src/ui/canvas/nodeTypes/cardNode.ts`; nonvisual details must stay in sync with `src/domain/nodeSemantics.ts`.

When: after Work Items panel flows need status grouping or users need blocked/done state visible without opening a panel.

What not: do not turn nodes into project-management cards with dense metadata, avatars, priority flags, and kanban styling.

Why not existing primitives: checklist items can express done/not done inside one node, but they do not express the state of the work item itself.

### Evidence Bundle

What: a proof/reference node that can hold multiple images or files with captions, alt text, and source notes.

Why: `imageNode` is a single visual reference. Operational work often needs before/after photos, receipts, marked-up proof, or grouped evidence tied to one job step.

Where: asset references already flow through `referencedAssetIds` in the node definition contract. The UI must keep using the existing Daptin asset boundary; non-UI backend operations must remain `daptin-cli` only.

When: after single-image upload and saved-image selection are stable enough that bundling assets is a real user need, not a workaround for an unfinished picker.

What not: do not create ad hoc asset wrappers, direct backend probes, or a hidden file database in node data.

Why not existing primitives: multiple separate image nodes lose the relationship between evidence items and make the canvas noisier.

### Site Or Location

What: a location node for site name, address, access notes, and optional field instructions.

Why: Canaster targets field and operational workflows where place often anchors work. A site primitive would make job context visible without requiring users to encode place as a generic note.

Where: likely a new built-in node type only when location-specific rendering, actions, or nonvisual labels are valuable. Plain address text can remain a note or work item detail until then.

When: after starter workspaces or user journeys show repeated address/access-note patterns across documents.

What not: do not add map APIs, geocoding, routing, or live location until privacy, permissions, offline behavior, and backend storage are explicitly designed.

Why not existing primitives: note nodes handle freeform place text, but they do not distinguish access instructions, site identity, and work context.

### Materials Or Asset List

What: a compact row-based node for parts, equipment, materials, quantities, and status.

Why: checklists only model completion. Operational documents often need counts, item names, notes, and readiness without becoming a spreadsheet.

Where: this belongs in a node definition with its own row rendering and inline editor, not in generic card detail text. Domain normalization must cap rows like checklist parsing already caps checklist items.

When: after users need repeated quantity lists in the current view and the right-side panel is not enough.

What not: do not build a BI table, arbitrary database grid, formula engine, or spreadsheet clone.

Why not existing primitives: checklist rows have one boolean state; material rows need quantity and availability semantics.

### Schedule Window

What: a time-window node for planned date, time range, sequence, and plain scheduling notes.

Why: many operational workflows are constrained by arrival windows, inspection times, handoffs, and follow-up dates.

Where: first-class node data only after date/time display, timezone handling, and local persistence behavior are defined. Rendering should stay compact and text-first.

When: after workspace documents need time sequencing on the canvas, not only inside a work item detail.

What not: do not add calendar sync, recurrence engines, reminders, or scheduling automation as part of the primitive.

Why not existing primitives: note and work item detail can store dates as text, but they cannot support consistent display, filtering, or nonvisual schedule state.

### Decision Or Issue

What: a node for an open question, current decision, options, and next action.

Why: operations work includes unresolved choices and blockers. A decision primitive can make uncertainty visible without forcing it into a task or note.

Where: this likely starts as a built-in only when the app supports enough workflow around unresolved/decided state. Until then, product copy and starter workspaces can model this with work items.

When: after users need to distinguish work to do from a decision needed before work can continue.

What not: do not create a debate board, mind-map branch type, or meeting-notes system.

Why not existing primitives: work items imply action; notes imply passive context. Decisions need state that is neither purely done nor merely text.

## Candidate Experiences

### Create From Selection

What: turn selected nodes into a child view while preserving a parent-summary node.

Why: nested canvas is a core product promise. Users need a simple way to clean up a busy view without manually creating a child view and moving work.

Where: the command/edit path must go through `CanvasEngine.executeCommand` and domain command planning, not direct UI mutation. It touches selection, node creation, geometry, portal summary, and document collection behavior.

When: after current create/open child view behavior is stable and undo/redo expectations are clearer.

What not: do not add a separate mutation path for pointer, keyboard, nonvisual, or AI flows.

Why not existing primitives: a view node exists, but there is no sourced flow that converts existing work into a nested view.

### Work Item Quick Add In Context

What: an inline quick-add affordance near the selected node or empty canvas point.

Why: the top command bar is persistent, but local creation near a current work area would reduce pointer travel and preserve spatial intent.

Where: this belongs in UI interaction and command creation. It should use registered node add options and `create-node`, not custom node construction.

When: after add-panel behavior is verified on small screens and with keyboard/nonvisual access.

What not: do not create a radial menu, decorative context wheel, or gesture-only workflow.

Why not existing primitives: this is an experience on top of existing primitives, not a new node type.

### Plain-Language Node Inspector

What: a focused selected-item panel that shows type, title, state, actions, and edit fields in product language.

Why: rich inline editing on canvas is useful, but some users need a stable form-like surface when the canvas is crowded or the viewport is small.

Where: the existing right-side utility drawer and node access panel are the likely surfaces. Nonvisual controls must continue to use the same engine command path.

When: after node data grows beyond title/detail/checklist/image fields.

What not: do not make this an admin schema editor, property grid, or developer-style inspector.

Why not existing primitives: this is not a primitive. It is the editing surface that prevents complex primitives from becoming cramped canvas widgets.

### Document-Level Starter Patterns

What: starter templates that combine primitives into real operational patterns: site visit, maintenance plan, delivery follow-up, asset check, client handoff.

Why: Canaster is easier to understand when users start from recognizable work, not abstract node types.

Where: current starter content lives under `src/app/starterWorkspace/catalog/`.

When: before adding too many built-ins. Templates can validate whether repeated patterns deserve primitives.

What not: do not add generic diagram templates, brainstorming maps, org charts, or developer architecture examples.

Why not new primitives first: templates are cheaper evidence. Repeated friction in templates can justify a built-in later.

## Follow-up Order

1. Use starter patterns to test demand before expanding built-ins.
2. Add work item state only when Work Items panel grouping or filtering needs it.
3. Treat evidence bundle and materials list as the first likely new built-ins because they represent operational objects that current primitives only approximate.
4. Keep site/location, schedule, and decision nodes behind clearer user-journey evidence.
5. Revisit `node-plugin-contract-plan.md` before adding any primitive whose semantics are domain-specific rather than broadly operational.
