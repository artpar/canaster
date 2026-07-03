# Deep Architecture and Technical Debt Review

Date: 2026-07-03

Scope: local source, scripts, product documentation, package metadata, and static architecture checks for the Canaster frontend/Daptin boundary. No Daptin backend probes were run. No dev server was started or restarted. `npm run build` was not run because the local agent instructions forbid it.

## Verification Performed

- `git status --short`: one unrelated untracked local artifact, `live-node-surfaces-toolbar.png`.
- `npm exec tsc -- --noEmit`: passed.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- Static import graph check:
  - No `src/domain` imports from `src/infra`.
  - One source dependency cycle: `src/ui/canvas/nested/NestedCanvasWorkspace.tsx -> src/ui/canvas/nested/NativeNestedCanvasController.ts -> src/ui/canvas/nested/NestedCanvasWorkspace.tsx`.
  - Four layer-direction violations centered on `src/app/agentBridge/CanasterAgentBridge.ts`.

## Executive Verdict

The codebase has a solid core in two places: the domain layer is currently protected from infra imports, and the Daptin document adapter largely respects the intended backend boundary by using the built-in `document` model rather than inventing a separate workspace persistence store.

The main debt is not TypeScript correctness. The current failure mode is architectural drift: stale docs and stale scripts describe a different product and source layout, while the live application has accumulated several large UI/app objects that own too many responsibilities. The highest-risk dead ends are the app-layer agent bridge importing infra and UI directly, the stale verification scripts that cannot be trusted, and agent access sharing a full bearer token inside a URL/clipboard command.

What not to do: do not add new tables, routes, metadata stores, document wrappers, or direct Daptin probes as a first move. The first move should be to align the documented contracts and verification path with what the code actually does, then reduce boundary crossings with small ports around the existing behavior.

## High Severity Findings

### 1. Architecture Documentation Is Stale And Contradicts The Product Boundary

Where:

- `docs/architecture-software-kt.md:21-40` says there is no backend, no persistence layer, no routing layer, no auth, and no save/load product flow.
- `docs/architecture-software-kt.md:37-38` names missing scripts: `scripts/generate-nested-grid-fixture.mjs` and `scripts/profile-nested-grid-fixture.mjs`.
- `docs/architecture-software-kt.md:238` and `docs/architecture-software-kt.md:351` reference `npm run fixture:nested`.
- `docs/README.md:24-32` references `npm run fixture:nested` and `npm run profile:nested`.
- Current source contains `src/infra/daptin/*`, `src/infra/browser/*`, document persistence, account state, live sync, and Daptin asset code.

Why this matters:

The docs now encode a false architecture. A maintainer following them would believe Canaster has no backend boundary and may design persistence from scratch. That directly conflicts with the current product frame: the frontend owns the canvas experience, while Daptin owns document persistence.

When it fails:

It fails during planning and onboarding, before code is written. It also fails during review because there is no reliable written source of truth for whether a change belongs in `domain`, `app`, `infra`, or `ui`.

What not to do:

Do not treat the old `src/engine/*` and "no backend" descriptions as partially true. They are stale enough to be dangerous. Replace or quarantine them before relying on them for architecture decisions.

Recommended repair:

Rewrite `docs/architecture-software-kt.md` around the actual `src/core`, `src/domain`, `src/app`, `src/infra`, and `src/ui` layout. Explicitly document the Daptin document boundary, account/session boundary, asset boundary, live transport boundary, and the fact that `domain` cannot import `infra`.

### 2. The Agent Bridge Violates The App Boundary In Both Directions

Where:

- `src/app/agentBridge/CanasterAgentBridge.ts:4-7` imports:
  - `src/infra/browser/workspaceUrlLocation`
  - `src/infra/daptin/daptinLive`
  - `src/ui/canvas/nested/NestedCanvasWorkspace`
  - `src/ui/canvas/nodeRegistry`
- `src/app/agentBridge/CanasterAgentBridge.ts:58-63` opens the Daptin live connection directly.

Why this matters:

`src/app` should orchestrate use cases. In this file it knows about browser URL mechanics, Daptin live transport, concrete React workspace handles, and UI node registry metadata. That makes the protocol hard to test outside the browser and hard to evolve without touching app, infra, and UI at once.

When it fails:

It fails when adding any new agent operation, because the easiest path is to keep importing more UI and infra into the app bridge. It also fails when trying to reuse the bridge in another runtime, because the bridge is already tied to browser and UI implementations.

What not to do:

Do not add more direct UI handle or Daptin imports to `CanasterAgentBridge.ts`. Do not move Daptin code into `domain` to make this look cleaner.

Recommended repair:

Keep the current behavior but invert the dependencies. Define app-level ports for:

- live transport connection
- workspace command surface
- node type metadata lookup
- workspace URL resolution

Then let `ui` and `infra` provide adapters at the composition boundary.

### 3. `App.tsx` Is A God Component For Product, Account, Document, Live, Asset, And Agent Behavior

Where:

- `src/ui/App.tsx` is about 2,499 lines.
- `src/ui/App.tsx:24-164` imports Daptin actions/assets/client/docs/live, browser storage, domain helpers, theme registries, export utilities, panels, and canvas workspace components.
- `src/ui/App.tsx:420-480` holds broad state and refs for document state, auth/account state, save state, live state, menus, theme, assets, and agent access.
- `src/ui/App.tsx:1271-1321` owns document visibility mutation flow.
- `src/ui/App.tsx:1335-1355` owns agent access clipboard flow.

Why this matters:

The component is no longer just an application shell. It is a composition root, account controller, document controller, live-status coordinator, asset workflow coordinator, menu coordinator, and export coordinator. This makes changes risky because unrelated workflows share state and handlers in one file.

When it fails:

It fails under product growth: save/open, account, live, export, asset upload, and agent access are all likely to change independently, but the implementation forces them through one large object. Review becomes expensive because a small feature touches a file that controls multiple critical workflows.

What not to do:

Do not move this logic into `domain` if it talks to Daptin, browser storage, clipboard, dialogs, or live transport. That would violate the boundary. Do not split it by arbitrary line ranges.

Recommended repair:

Extract behavior by workflow, preserving current public props and behavior:

- document lifecycle hook/use-case
- account/session hook
- live connection hook
- asset workflow hook
- agent access hook
- export workflow hook

After extraction, keep `App.tsx` as the composition shell.

### 4. Verification Tooling Contains Dead Ends And Rule Violations

Where:

- `package.json:6-18` has no general `test`, `probe`, `fixture`, or `profile` scripts.
- `package.json:16` defines `daptin:live:e2e`.
- `package.json:18` defines `daptin:check:cloud` using `curl`.
- `scripts/canaster-live-e2e.mjs:12` points at `src/catalog/service-business-atlas.json`, but the current file is under `src/app/starterWorkspace/catalog/service-business-atlas.json`.
- `scripts/canaster-live-e2e.mjs:31` starts its own Vite server.
- `scripts/daptin-smoke.mjs:124-145` defines a custom direct HTTP `fetch` helper for Daptin API calls.

Why this matters:

The repo has a TypeScript check, but the documented deeper verification path is broken or conflicts with current backend-operation rules. A maintainer cannot honestly prove canvas performance, nested workspace behavior, or Daptin integration behavior through the scripts currently advertised by docs.

When it fails:

It fails when someone tries to validate a risky change. The stale live E2E script fails before it can test product behavior because the fixture path is wrong. The Daptin smoke script and cloud check are not acceptable under the current rule that non-UI Daptin backend operations must go through `daptin-cli`.

What not to do:

Do not run or expand direct HTTP Daptin scripts. Do not add another ad hoc probe script to compensate. Do not start a second dev server to work around missing test orchestration.

Recommended repair:

Replace Daptin smoke and cloud checks with `daptin-cli` flows or remove them from local verification. Fix or remove `daptin:live:e2e` after deciding whether it is still a supported workflow. Restore documented canvas fixture/profile scripts only if they are still part of the maintenance standard.

### 5. Agent Access Shares A Bearer Token Through URL And Clipboard Surfaces

Where:

- `src/ui/App.tsx:110-117` builds a live WebSocket URL with `accessToken` in the query string.
- `src/app/agentAccess/createAgentAccessBrief.ts:21` includes the full live WebSocket URL in copied text.
- `src/app/agentAccess/createAgentAccessBrief.ts:32` includes a shell command containing that URL.
- `src/ui/App.tsx:1335-1355` copies the generated agent access brief to clipboard.
- `scripts/canaster-agent.mjs:26-68` accepts the URL and sends live protocol requests.

Why this matters:

Bearer tokens in URLs are easy to leak through clipboard history, shell history, process listings, terminal scrollback, logs, and issue reports. The access being shared appears to be the account token used for live Daptin access, not a narrow, short-lived capability scoped to a single document/work item operation.

When it fails:

It fails when a user copies the helper command into a terminal, shares a bug report, or leaves shell history intact. The leak surface exists even if the WebSocket protocol itself works correctly.

What not to do:

Do not broaden this feature by adding more agent topics or commands on top of the same token-sharing pattern. Do not hide the risk behind UI wording.

Recommended repair:

Introduce a scoped, expiring agent capability if Daptin supports it. If not, make the limitation explicit in the product and avoid generating shell commands with bearer tokens embedded in the URL.

## Medium Severity Findings

### 6. UI Node Types Reach Directly Into Daptin And Browser Asset Infra

Where:

- `src/ui/canvas/nodeTypes/fileAssetPreview.ts:1-3` imports local browser assets, Daptin assets, and Daptin client helpers.
- `src/ui/canvas/nodeTypes/fileAssetPreview.ts:16-23` decides whether to save file assets locally or through Daptin based on stored-token state.
- `src/ui/canvas/nodeTypes/imageNode.ts:1-2` imports Daptin asset helpers directly.
- `src/ui/canvas/nodeTypes/imageNode.ts:89-100` and `src/ui/canvas/nodeTypes/imageNode.ts:186-194` handle sign-in-required asset behavior inside node/editor code.

Why this matters:

Node definitions should describe canvas behavior and editing surfaces. These files now own persistence selection, account-sensitive asset behavior, and Daptin upload details. That makes asset behavior hard to change without editing canvas node code.

When it fails:

It fails when adding another asset backend, changing account rules, or testing nodes without Daptin/browser storage. It also makes offline/online behavior harder to reason about because the decision is hidden inside node rendering/editing modules.

What not to do:

Do not move asset persistence into `domain`; it depends on browser and backend behavior. Do not add more Daptin client imports to node type files.

Recommended repair:

Create an app/UI asset service port and inject it into node editing/rendering code. Keep Daptin and IndexedDB implementations in `infra`.

### 7. Nested Canvas Has A Type-Level Cycle Between Workspace And Controller

Where:

- `src/ui/canvas/nested/NestedCanvasWorkspace.tsx:18` imports `NativeNestedCanvasController`.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:65` imports request/state types from `NestedCanvasWorkspace`.
- Static graph cycle: `NestedCanvasWorkspace.tsx -> NativeNestedCanvasController.ts -> NestedCanvasWorkspace.tsx`.

Why this matters:

The controller import is type-only on one side, so this is not currently a runtime cycle. It is still an architecture smell because the controller and React component define each other's contract. It makes the boundary harder to split or test.

When it fails:

It fails when either side needs a value import or when shared request/state types grow. A type-only cycle can silently become a runtime cycle during ordinary maintenance.

What not to do:

Do not add value imports from the controller back to the React workspace component.

Recommended repair:

Move shared request/state/handle contract types into a small sibling module, for example `src/ui/canvas/nested/NestedCanvasWorkspaceTypes.ts`, or into a domain-level module only if the types are pure product state and contain no React/DOM concepts.

### 8. `CanvasEngine.ts` Is Too Broad For A Single Maintained Unit

Where:

- `src/ui/canvas/CanvasEngine.ts` is about 2,959 lines.
- `src/ui/canvas/CanvasEngine.ts:2`, `src/ui/canvas/CanvasEngine.ts:17`, and `src/ui/canvas/CanvasEngine.ts:20` import UI shortcut, node registry, and nested toolbar behavior.
- `src/ui/canvas/CanvasEngine.ts:272-291` creates DOM overlay/editor/toolbar layers.
- `src/ui/canvas/CanvasEngine.ts:297-300` configures focus and event listeners.
- `src/ui/canvas/CanvasEngine.ts:520` onward owns substantial command planning and interaction behavior.

Why this matters:

This class owns rendering, DOM overlay layers, focus/input registration, interaction planning, toolbar behavior, and command execution glue. Because canvas behavior is a primary product surface, every unrelated concern inside this file raises the cost of changing the workspace experience.

When it fails:

It fails when changing input behavior, inline editing, rendering, command semantics, or toolbar behavior because the same file must be understood across multiple execution domains: canvas drawing, DOM event handling, UI overlays, and product commands.

What not to do:

Do not extract by creating generic abstractions with no product boundary. Do not move DOM/canvas code into `domain`.

Recommended repair:

Extract only seams that are already visible:

- pure command planning to a domain or app-level planner if it has no DOM/canvas dependency
- overlay/editor DOM management to a UI helper
- toolbar lifecycle to a UI helper
- input event normalization to a focused controller

Keep visual rendering close to the engine until there are tests around behavior.

### 9. PDF And Object URL Caches Have Lifecycle Gaps

Where:

- `src/ui/canvas/nodeTypes/pdfCanvasPreview.ts:31` defines `pdfDocumentCache = new Map()`.
- `src/ui/canvas/nodeTypes/pdfCanvasPreview.ts:69-89` loads PDF documents into that cache.
- `src/ui/canvas/nodeTypes/pdfCanvasPreview.ts:120-170` renders PDF pages into canvases.
- `src/infra/daptin/assets.ts:47` stores object URLs.
- `src/infra/daptin/assets.ts:114-117` exports `releaseAssetObjectUrls`, but there is no current `src` caller.
- `src/infra/browser/localAssets.ts:81-84` exports `releaseLocalAssetObjectUrls`, but there is no current `src` caller.
- `src/ui/canvas/nodeTypes/markdownNode.ts:157` and `src/ui/canvas/nodeTypes/markdownNode.ts:192-198` show a healthier bounded cache pattern with a max size and eviction.

Why this matters:

Long-running workspace sessions can load many PDFs and asset previews. Unbounded PDF document caches and unreleased object URLs can retain memory after a document or workspace is no longer visible.

When it fails:

It fails during extended editing sessions, asset-heavy workspaces, repeated open/close flows, or tests that load many documents. The symptom will be memory growth rather than a TypeScript error.

What not to do:

Do not just raise cache sizes or add another map. Do not rely on browser navigation as the only cleanup strategy in a single-page app.

Recommended repair:

Add explicit document/workspace-close cleanup. Bound the PDF cache and call the PDF document destroy/cleanup path when evicting. Wire Daptin/local object URL release functions into document close, asset replacement, or app teardown.

### 10. Legacy Canway Names Remain In Storage, Debug Globals, And Warnings

Where:

- `src/infra/browser/workspaceStorage.ts:5-8` uses `canway-workspaces` and `canway-workspace-snapshot:`.
- `src/infra/browser/workspaceStorage.ts:38`, `src/infra/browser/workspaceStorage.ts:94`, `src/infra/browser/workspaceStorage.ts:115`, and `src/infra/browser/workspaceStorage.ts:132` log "Canway" warnings.
- `src/infra/browser/localAssets.ts:24-39` uses `canway-local-assets` and `CanwayLocalAssetDatabase`.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:290-291` and `src/ui/canvas/nested/NativeNestedCanvasController.ts:1898` expose `__canwayNested`.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:2191-2211` references `__canwayNativeCanvasLog`, `__CANWAY_DEBUG_CANVAS`, and `canway-native` performance marks.

Why this matters:

Some of these names are probably compatibility names for existing local data. Others are debug and warning names that make the current product harder to reason about. The risk is not cosmetic only: storage names become migration contracts.

When it fails:

It fails during rename/migration work. A naive rename can orphan existing local drafts or local assets. Leaving the names forever makes diagnostics and docs drift.

What not to do:

Do not silently rename IndexedDB databases or localStorage prefixes without a migration bridge. Do not mix new Canaster names and old Canway names ad hoc.

Recommended repair:

Classify each name as compatibility storage, internal debug, or stale user-facing text. For compatibility storage, add explicit comments and migration planning. For debug globals and warnings, rename under a controlled compatibility alias if needed.

### 11. Infra Exports Include Dormant Or Partially Surfaced Capabilities

Where:

- `src/infra/daptin/canasterDocuments.ts` exports `loadDocument`, `makeDocumentPrivate`, `makeDocumentPublic`, and `deleteDocument`, but current `src` callers do not use them directly.
- `src/infra/daptin/daptinClient.ts` exports endpoint override helpers that current `src` callers do not use.
- `src/infra/browser/workspaceStorage.ts` exports `clearWorkspaceSnapshot`, but current `src` callers do not use it.
- `src/infra/browser/localAssets.ts` exports `saveLocalImageAsset` and `releaseLocalAssetObjectUrls`, but current `src` callers do not use them.
- `src/infra/daptin/assets.ts` exports `releaseAssetObjectUrls`, but current `src` callers do not use it.
- `src/ui/DocumentsPanel.tsx` does not expose document delete even though the adapter has `deleteDocument`.

Why this matters:

Some of this may be intentional public API surface. Without comments, tests, or UI journeys, these exports look like unfinished pathways. Future work may assume product support exists because an adapter function exists.

When it fails:

It fails when a maintainer wires a dormant function directly into UI without checking access rules, product copy, confirmation flows, live state, or local draft behavior.

What not to do:

Do not delete these exports blindly if they are planned public API. Do not expose them in UI just because the adapter already has them.

Recommended repair:

Mark deferred adapter functions with short comments or tests that define intended behavior. Either wire them through a supported journey or keep them internal until the journey exists.

## Low Severity Findings

### 12. A Raw Production `console.log` Remains In Document Live Handling

Where:

- `src/ui/App.tsx:2465-2467` logs `Get document id from` with the live event.

Why this matters:

Raw event logging can leak document/live metadata into the browser console and makes debugging noisier. It also bypasses any intended debug gating.

When it fails:

It fails during normal product use when live events occur.

What not to do:

Do not leave raw live event logging in product code. Do not replace it with another always-on log.

Recommended repair:

Remove it or route it through an explicit debug logger controlled by a development-only flag.

### 13. Formatting And Maintenance Gates Are Under-Specified

Where:

- `package.json:6-18` defines dev, typecheck, preview, Daptin scripts, and audit, but no formatter, lint, or general test gate.
- Import style and spacing vary across large files.

Why this matters:

The project relies heavily on TypeScript for correctness, but there is no consistent automated style or lint gate. That makes large-file churn harder to review and allows small quality regressions to accumulate.

When it fails:

It fails during repeated feature work in `App.tsx`, `CanvasEngine.ts`, and node type files, where unrelated formatting churn can obscure behavioral changes.

What not to do:

Do not mass-format the repo without first adding agreed tooling and checking user-owned changes. Do not introduce lint rules that conflict with the existing architecture without fixing the architecture first.

Recommended repair:

Add a small formatting/lint gate after the stale docs and verification scripts are corrected. Apply it incrementally or with a clearly separated formatting-only change.

## Confirmed Healthy Constraints

- `src/domain` currently does not import `src/infra`.
- `npm exec tsc -- --noEmit` passes.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- `src/infra/daptin/canasterDocuments.ts` uses Daptin's built-in `document` model and does not create a parallel workspace table.
- `src/infra/daptin/canasterDocuments.ts:107-132` follows a placeholder-create, visibility-action, update flow for document creation.
- `src/ui/canvas/nodeTypes/markdownNode.ts` uses DOMPurify for rendered markdown sanitization and has a bounded cache pattern.
- `scripts/provision-canaster-share-template.sh` explicitly uses `daptin-cli` and states that direct HTTP/SQL is not used.

## Recommended Repair Order

1. Replace or quarantine stale architecture docs and verification instructions.
2. Fix package scripts so advertised checks are real and rule-compliant; remove direct Daptin HTTP checks from normal workflows.
3. Refactor `CanasterAgentBridge.ts` behind app-level ports for live transport, workspace commands, URL resolution, and node metadata.
4. Split `App.tsx` by supported product workflows while keeping it as the composition shell.
5. Move Daptin/local asset decisions out of node type files behind an injected asset service.
6. Break the nested workspace/controller type cycle by moving shared contract types to a dedicated module.
7. Add explicit cache and object URL lifecycle cleanup for PDFs and asset previews.
8. Classify and migrate legacy Canway names deliberately.
9. Remove or mark dormant infra exports according to supported user journeys.
10. Remove the raw live-event `console.log`.
11. Add formatting/lint/test gates only after the stale verification path is corrected.

## Bottom Line

The codebase is not broken at the compiler level. The problem is maintainability drift. The highest-value work is to make the real architecture explicit, repair the verification path, and stop app/UI/infra coupling from spreading further. After that, the large UI units can be split along actual product workflows without inventing a new architecture or breaking the Daptin persistence contract.
