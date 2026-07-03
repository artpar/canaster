# Canaster Architecture And Software KT

Date: 2026-07-03

Purpose: this document is the current continuity handoff for Canaster architecture, ownership boundaries, persistence contracts, edit contracts, verification expectations, and known limits. It replaces older Canway-era architecture notes that described a canvas-only app with no backend.

## Product Frame

Canaster is a nested visual canvas workspace for practical operational documents. The frontend owns the canvas, workspace, view navigation, panels, and interaction experience. Daptin owns the backend boundary for account sessions, saved documents, asset storage, visibility actions, and live transport.

Use product language in user-facing surfaces and docs:

- workspace
- document
- view
- panel
- work item
- save
- open
- account

Do not describe Canaster as a developer diagramming tool, BI dashboard, generic whiteboard, database UI, or novelty mind-map app.

## Current Verdict

What is solid now:

- The source tree has explicit `core`, `domain`, `app`, `infra`, and `ui` layers.
- `src/domain` currently has no imports from `src/infra`.
- The saved-document adapter uses Daptin's built-in `document` model instead of creating a parallel workspace table.
- Workspace data persists as a Canaster workspace snapshot in Daptin `document.document_content`.
- Local draft persistence exists through browser storage.
- The UI supports account sign-in, save online, open saved documents, document visibility, assets, live state, nested canvas navigation, and a starter workspace.
- The canvas model has a shared command/model-change path for pointer, keyboard, nonvisual, and agent-oriented edits.

What is not yet clean:

- `src/app/agentBridge/CanasterAgentBridge.ts` currently imports concrete infra and UI modules directly.
- `src/ui/App.tsx` is still a large composition shell that owns too many workflows.
- Some UI node type modules reach directly into Daptin/browser asset infra.
- The nested workspace/controller contract has a type-level cycle.
- Verification tooling is stale around old fixture/profile scripts and must not be treated as a current gate.
- Some legacy Canway storage/debug names remain for compatibility or cleanup.

## Source Map

Primary authored source:

- `src/core/`: pure utilities, primitives, and small normalization helpers that do not know about product workflows, Daptin, React, DOM, or browser storage.
- `src/domain/`: pure workspace/document model, command semantics, view state, node data normalization, node semantic definitions, and history helpers. This layer must not import `src/infra`.
- `src/app/`: use-case and orchestration code that is not React UI and not concrete backend implementation. Current examples are starter workspace catalog code and the agent access/protocol bridge.
- `src/infra/browser/`: browser-owned persistence and URL state such as IndexedDB/localStorage workspace snapshots, local asset storage, and workspace URL serialization.
- `src/infra/daptin/`: Daptin client/session handling, document persistence, asset storage, visibility actions, and live transport.
- `src/ui/`: React components, panels, toolbar, canvas engine, nested canvas runtime, node rendering, node editors, theme system, and DOM interaction handlers.
- `src/app/starterWorkspace/catalog/service-business-atlas.json`: the authored starter workspace data used for new local workspaces.
- `docs/`: current architecture, product journey, implementation, audit, and historical reports.
- `daptin/` and `deploy/daptin/`: Daptin backend configuration and deployment material.

Generated or installed output:

- `dist/`: generated build output.
- `node_modules/`: installed dependencies.

Do not treat generated output as source ownership.

## Layer Ownership Rules

### `src/core`

`core` contains pure reusable primitives and helpers. It may be used by every other layer.

Allowed:

- JSON/data normalization helpers.
- slug and filename helpers.
- primitive node/asset/canvas appearance types.
- small functions with no product workflow ownership.

Not allowed:

- React, DOM, browser storage, Daptin, HTTP, filesystem, or account/session code.
- Product orchestration.

### `src/domain`

`domain` contains pure business/model logic. It owns Canaster's workspace/document semantics, not backend persistence.

Allowed:

- canvas/document model types;
- document commands and model changes;
- nested document/view state;
- node semantic definitions;
- workspace history and snapshot hydration;
- pure layout and normalization logic.

Not allowed:

- imports from `src/infra`;
- direct Daptin, HTTP, IndexedDB, localStorage, DOM, React, or filesystem access;
- account/session handling;
- UI panels, CSS, canvas drawing, or event listeners.

The hard rule: `domain` cannot import `infra`.

### `src/app`

`app` coordinates use cases and protocols. It may depend on `core` and `domain`. When it needs persistence, browser URL state, live transport, or UI behavior, the maintainable shape is an explicit port injected from the composition boundary.

Allowed:

- starter workspace catalog hydration;
- protocol definitions;
- use-case orchestration that can be tested without React or Daptin when ports are supplied.

Current debt:

- `src/app/agentBridge/CanasterAgentBridge.ts` imports `src/infra/daptin/daptinLive`, `src/infra/browser/workspaceUrlLocation`, `src/ui/canvas/nested/NestedCanvasWorkspace`, and `src/ui/canvas/nodeRegistry`.

What not to add:

- more concrete `ui` or `infra` imports in app orchestration;
- Daptin or browser details in protocol logic;
- React handles as the long-term app contract.

### `src/infra`

`infra` owns concrete external systems and browser persistence.

Allowed:

- Daptin client/session/document/asset/live adapters;
- Daptin action invocation wrappers;
- browser IndexedDB/localStorage storage;
- URL serialization and browser-owned workspace location state;
- third-party API integration code.

Not allowed:

- product UI decisions;
- direct domain mutation outside domain helpers;
- new app-owned persistence models that duplicate Daptin built-ins without an explicit architecture decision.

### `src/ui`

`ui` owns React, DOM, canvas drawing, panels, menus, theme application, interaction handlers, and user-visible workflow composition.

Allowed:

- React components;
- canvas engine and nested canvas runtime;
- node rendering and editing surfaces;
- account/document panels;
- toolbar and drawer behavior;
- UI composition of app and infra adapters.

Not allowed:

- pure business rules that belong in `domain`;
- new backend access rules hidden inside rendering code;
- user-facing Daptin implementation details.

## Persistence Boundary

Canaster has two persistence modes:

1. Local draft persistence on the user's device.
2. Online saved-document persistence through Daptin.

### Local Drafts

Local drafts are stored by browser infra:

- `src/infra/browser/workspaceStorage.ts`
- `src/infra/browser/localAssets.ts`

Local storage is for device-local continuity and offline-friendly draft behavior. It is not the canonical online document model.

Legacy Canway storage names still exist in some browser storage keys and debug names. Treat those names as compatibility surface until a deliberate migration exists.

### Daptin Documents

Online workspaces are saved as Daptin built-in `document` rows through `src/infra/daptin/canasterDocuments.ts`.

Current contract:

- The actual workspace snapshot is stored in `document.document_content`.
- Canaster document files use JSON content.
- `document.document_path` and `document.document_name` identify the stored file object.
- The adapter hydrates loaded content back into the domain workspace snapshot shape.
- Do not create a separate workspace table for the current document persistence path.
- Do not add `document_acl`, `owner_id`, `visibility`, `share_token`, or invite tables unless a new architecture decision explicitly supersedes the current Daptin boundary.

Why this matters:

Daptin already owns document storage. Adding another workspace table or duplicating document metadata would create migration, access-control, and compatibility costs without solving the current product contract.

### Document Visibility

Document visibility is not stored in `document_content`.

Current contract:

- Visibility is backed by Daptin row permission on the built-in `document` row.
- The browser calls schema-managed Daptin actions for visibility changes.
- `set_canaster_document_private` sets private document permissions.
- `set_canaster_document_public` sets public-readable document permissions.
- The UI exposes Private/Public only for saved online documents.
- Group sharing remains deferred.

See `docs/document-visibility-implementation.md` for the detailed visibility contract.

What not to do:

- Do not store visibility, owner, members, or group ids inside the workspace snapshot.
- Do not use generic JSON:API row updates to patch `permission`.
- Do not expose a Shared state until group membership and group-row permissions have a supported adapter and product journey.

### Assets

Assets are split across local and Daptin-backed paths:

- Daptin assets: `src/infra/daptin/assets.ts`
- Local assets: `src/infra/browser/localAssets.ts`
- asset-related pure helpers: `src/core/workspaceAssetTypes.ts` and `src/core/workspacePreviewAssetFileName.ts`

Current contract:

- Signed-in online asset flows use Daptin `asset`.
- Local draft asset flows may use browser storage.
- Nodes store asset references in node data; the asset bytes are outside the workspace snapshot.
- Visibility actions exist for Daptin assets.

Current debt:

- Some node type files import Daptin/local asset infra directly. The cleaner direction is an injected asset service at the app/UI boundary.

What not to do:

- Do not embed large file bytes directly into workspace snapshots.
- Do not invent asset wrapper tables before proving Daptin `asset` is insufficient.

### Account And Session

Account/session behavior belongs to the Daptin infra boundary and UI composition:

- `src/infra/daptin/daptinClient.ts` owns Daptin client setup, token storage, endpoint selection, token expiry checks, and session cleanup.
- `src/infra/daptin/canasterDocuments.ts` exposes sign-in, verification, sign-out, document list/load/save/create, and visibility operations.
- Account UI belongs in `src/ui`.

What not to do:

- Do not place tokens or Daptin auth state in `domain`.
- Do not use product UI copy that exposes backend implementation names.

## Live Transport And Agent Boundary

Daptin live transport is implemented in `src/infra/daptin/daptinLive.ts`.

The agent protocol is defined under `src/app/agentBridge/` and `src/app/agentAccess/`.

Current contract:

- Agent messages operate against the currently open saved document/page context.
- Agent requests must go through the same workspace/document mutation semantics as other edit sources.
- Agent-facing operations must not invent separate model mutation paths.

Current debt:

- `CanasterAgentBridge.ts` currently connects directly to Daptin live and knows about concrete UI workspace handles and node registry functions.

Target direction:

- `app` defines protocol/use-case logic.
- `infra` supplies live transport.
- `ui` supplies workspace command and view-state adapters.
- Composition wires those pieces together without app importing concrete UI or Daptin modules directly.

Security note:

The current agent access flow generates URLs/commands containing bearer access. Do not expand that pattern without a scoped and expiring capability model or an explicit product/security decision.

## Canvas And Edit Contract

The canvas runtime lives in `src/ui/canvas/`.

Important files:

- `src/ui/canvas/CanvasEngine.ts`: main canvas runtime for rendering, input, command execution glue, overlays, and interaction state.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts`: native nested canvas controller for recursive workspace layout, portal slots, storage handoff, and debug hooks.
- `src/ui/canvas/nested/NestedCanvasWorkspace.tsx`: React workspace wrapper and composition surface for the nested runtime.
- `src/domain/documentCommands.ts`: pure document command application and model-change semantics.
- `src/domain/documentModel.ts`: pure document/workspace model helpers.
- `src/domain/documentTypes.ts`: document/workspace snapshot and command types.
- `src/domain/types.ts`: canvas model and engine-facing pure types.

Committed edit invariant:

All committed edits must enter through the shared command/model-change path. Pointer, keyboard, nonvisual, and agent edit sources may differ in how they are initiated, but they must not fork separate mutation semantics.

Preview invariant:

Pointer drag and resize preview must remain render-only. Preview geometry must not mutate committed model geometry before commit.

Why this matters:

Undo/redo, save/load, local persistence, live sync, agent operations, accessibility controls, and replayable changes all depend on a clean split between transient interaction state and committed workspace state.

What not to do:

- Do not mutate node geometry directly from event handlers for committed edits.
- Do not add separate pointer-only, keyboard-only, nonvisual-only, or agent-only mutation paths.
- Do not store transient preview geometry in saved workspace snapshots.
- Do not put Daptin/account behavior inside `domain` model functions.

## Nested Workspace Contract

Canaster documents contain multiple views/canvases linked by portal nodes. The user moves between parent and child contexts while keeping orientation.

Current runtime ownership:

- React owns high-level workspace composition.
- `NativeNestedCanvasController` owns immediate nested canvas layout, portal slots, parent context panes, live/dormant engine slots, storage handoff, and DOM/canvas lifecycle.
- Domain helpers own pure document collection, parent/child, view state, and snapshot logic.

Current debt:

- `NestedCanvasWorkspace.tsx` imports `NativeNestedCanvasController`.
- `NativeNestedCanvasController.ts` imports request/state types from `NestedCanvasWorkspace.tsx`.
- This is currently type-level on one side, but it should be broken by moving shared contract types into a dedicated module.

What not to do:

- Do not create a value import cycle between the React workspace and the native controller.
- Do not move DOM/canvas lifecycle concerns into `domain`.

## UI Composition Contract

The UI layer is allowed to compose product workflows, but it should not hide backend access rules or pure business rules inside rendering code.

Important files:

- `src/ui/App.tsx`: current app composition shell. It owns account, document, save/open, live, menu, export, agent, asset, and nested workspace wiring today.
- `src/ui/HeaderToolbar.tsx`: top command bar.
- `src/ui/SidePanel.tsx`, `src/ui/DocumentsPanel.tsx`, `src/ui/AccountPopover.tsx`: account/document/work-item surfaces.
- `src/ui/canvas/nodeTypes/*`: concrete node rendering/editing modules.
- `src/ui/theme/*`: theme definitions and providers.

Current debt:

- `App.tsx` is too broad and should be split by workflow.
- Node type modules should not accumulate more direct Daptin/browser persistence decisions.

Target direction:

- Keep `App.tsx` as the composition shell.
- Extract document lifecycle, account/session, live connection, asset workflow, export workflow, and agent access into focused hooks/use-cases.
- Inject asset and live/document adapters rather than importing infra from deep rendering modules.

## Daptin Backend Operation Rules

For local development and agent work, Daptin backend operations must use the supported boundary:

- Prefer the running Canaster app UI for user-account document flows.
- Use `daptin-cli` for non-UI Daptin backend operations.
- Do not use direct SQL, `curl`, inline Node.js, browser `fetch` snippets, custom HTTP scripts, or one-off command probes to interact with a Daptin backend.
- Do not perform production auth or credential-validity checks without explicit approval for the exact `daptin-cli` command.

Repository note:

Some older scripts still use direct HTTP or `curl`. They are stale against the current operation rules and must not be treated as the approved maintenance path.

## Local Persistent Daptin

The local Daptin development target is a persistent Compose instance, not a scratch smoke runtime:

- `npm run daptin:up` prepares `.tmp/daptin/local-schema` and starts `docker-compose.daptin.yml`.
- The Compose file uses named `postgres-data` and `daptin-data` volumes.
- Normal `npm run daptin:down` stops the backend without deleting local account, document, asset, or mail state.
- Local app development should use `npm run dev:local`, which points the frontend at `http://canaster.local:6336`.
- Local mail-oriented flows use `canaster.local`, `mail.canaster.local`, and `imap.canaster.local`, all resolving to `127.0.0.1`.

The generated local schema substitutes local mail identity only. Production schema files under `daptin/` must keep `login@canaster.in` and `mail.canaster.in`. Do not edit production schema just to make local OTP mail easier.

## Verification Gate

Rapid local check for day-to-day Canaster development:

```bash
npm run verify:fast
```

This proves TypeScript correctness and catches whitespace/conflict-marker issues without touching Daptin, running browser automation, producing build output, or depending on the network.

Full rule-compliant static checks:

```bash
npm run verify:static
```

Do not run `npm run build` in the current local agent workflow. The build script exists in `package.json`, but the active repository instructions forbid running it.

Do not advertise or rely on these old missing gates:

- `npm run fixture:nested`
- `npm run profile:nested`
- old `src/engine/*` fixture/profile scripts

What the current static gate proves:

- TypeScript type checking passes.
- Production dependency audit has no known vulnerabilities.
- The diff has no whitespace/conflict-marker problems.

What the current static gate does not prove:

- browser interaction correctness;
- real-device touch behavior;
- Daptin integration correctness;
- live transport correctness;
- asset upload/download correctness;
- product-complete accessibility;
- performance of large or asset-heavy workspaces.

Verification debt:

The repo needs a new rule-compliant interaction and integration verification path that matches the current source tree and Daptin operation rules.

The old direct-backend Daptin smoke and live E2E scripts have been removed from the runnable package scripts. Do not restore them by path-fixing stale fixtures or adding custom HTTP probes; replace them with app-UI verification or `daptin-cli`-backed automation.

## Known Limits And Current Technical Debt

Keep these visible until fixed:

- `CanasterAgentBridge.ts` crosses app/ui/infra boundaries.
- `App.tsx` is too large and owns too many workflows.
- Some node type modules import asset infra directly.
- The nested workspace/controller type cycle should be broken.
- PDF and asset object URL cache lifecycle needs explicit cleanup.
- Legacy Canway names remain in storage/debug surfaces.
- Some Daptin smoke/check scripts conflict with current backend operation rules.
- Historical docs and audit reports may describe old source paths or fixed issues.

## Development Workflow

Recommended loop:

1. Read `PRODUCT.md`, `DESIGN.md`, `docs/canaster-user-journeys.md`, and this document before changing product behavior or UI.
2. Inspect live source before relying on historical reports.
3. Identify the owning layer before editing.
4. Preserve public APIs unless explicitly marked movable.
5. Keep domain pure and free of infra imports.
6. Make the smallest coherent change that respects the existing persistence contract.
7. Run rule-compliant verification.
8. Update current docs when an architecture contract changes.

What not to do:

- Do not invent a cleaner persistence model before proving the current Daptin primitive is insufficient.
- Do not add backend tables, metadata columns, or wrapper objects without an explicit architecture decision.
- Do not move public APIs casually.
- Do not use stale historical docs as current architecture.
- Do not hide known gaps in completion reports.

## Fast Orientation For Future Agents

If resuming work cold:

1. Check `git status --short --branch`.
2. Read `PRODUCT.md`.
3. Read `DESIGN.md`.
4. Read `docs/canaster-user-journeys.md`.
5. Read this file.
6. Inspect the owning source files for the task.
7. Run only rule-compliant checks after changes.

The main architectural rule is simple: preserve the existing Canaster/Daptin boundary, keep `domain` pure, and route committed workspace edits through the shared command/model-change path.
