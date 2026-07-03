# Deep Architecture And Technical Debt Review

Date: 2026-07-03

Scope: current local source, scripts, package metadata, and architecture/product documentation for the Canaster frontend and Daptin boundary. No Daptin backend probes were run. No dev server was started or restarted. `npm run build` was not run because the active local instructions forbid it.

## Verification Performed

- `git status --short --untracked-files=all`: use the current command output as the worktree baseline; this report is not a stable status snapshot.
- `npm run verify:fast`: passed.
- `npx tsc --noEmit`: passed through `verify:fast`.
- `git diff --check`: passed.
- `npm audit --omit=dev`: passed, 0 vulnerabilities.
- `npx madge --extensions ts,tsx --circular src`: passed, no circular dependency found.
- `npx madge --extensions ts,tsx --orphans src`: after follow-up cleanup, reports only `ui/main.tsx` and `vite-env.d.ts`, which are expected entry/environment files.
- `npx ts-prune`: used as a rough stale-export scan. Its output contains expected false positives for public types and module-local exports, so only corroborated items are listed as findings.

## Executive Verdict

The codebase is healthier than the older report in this file claimed. The current `src/domain` layer still has no `src/infra` imports, the app-layer agent bridge has already been moved behind ports, the nested workspace/controller cycle is gone, and PDF/object URL cache cleanup has been substantially improved.

The remaining debt is now concentrated in four places:

- product workflow composition is still too centralized in `src/ui/App.tsx`;
- the nested canvas runtime and asset workflow hooks are large ownership clusters;
- Daptin verification and deployment operations still have unsupported or rule-conflicting paths;
- stale/deferred public surfaces remain in docs and compatibility exports.

What not to do: do not respond to these debts by inventing a new persistence model, adding backend tables, moving Daptin details into `domain`, or mass-renaming storage keys. The current Daptin document and asset primitives are real contracts. The repair path is to tighten boundaries around the existing behavior.

## High Severity Findings

### 1. Agent Access Copies A Full Bearer Token In A Live URL

Where:

- `src/ui/useAgentAccess.ts:225-245` reads the stored token and passes it into the copied agent access brief.
- `src/app/agentAccess/createAgentAccessBrief.ts:11-22` builds and includes a live websocket URL containing the token.
- `src/app/agentAccess/createAgentAccessBrief.ts:31-32` includes a ready-to-run shell command with the token-bearing URL.
- `src/app/agentAccess/createAgentAccessBrief.ts:110-117` stores the token in the `token` query parameter.
- `scripts/canaster-agent.mjs:26-68` accepts that URL and connects directly.

Why this matters:

The copied access material contains a bearer credential. It can leak through clipboard history, shell history, process listings, terminal scrollback, crash reports, screen sharing, or copied support text. The topic is scoped to the open page, but the websocket credential is still the account live token, not a narrow document-scoped capability.

When it fails:

It fails during normal use of "Copy for agent", especially if the helper command is pasted into a terminal or issue report. The failure is not a compiler failure; it is a credential-handling and auditability failure.

What not to do:

Do not expand the agent protocol surface on top of this credential-sharing pattern. Do not hide the risk in UI copy. Do not move token handling into `domain`.

Why not:

Adding more commands to the same copied bearer URL increases the blast radius without changing the security model. `domain` cannot own account/session credentials.

Recommended repair:

Replace the copied account token with a scoped, expiring agent capability if Daptin can support it. Until then, treat the feature as a local/developer capability and avoid generating shell commands that embed long bearer URLs.

### 2. Deployment Scripts Directly Bypass The Daptin Operation Boundary

Where:

- `deploy/gcp/vm-deploy-image.sh:34-43` runs `psql` directly against the Daptin database to update the `signin` action permission.
- `deploy/gcp/vm-deploy-image.sh:76-80` health-checks Daptin with raw HTTP against `/api/world`.
- `deploy/gcp/vm-startup.sh:99-102` writes the same raw Daptin HTTP health check into the VM deploy script.
- `AGENTS.md` and `docs/architecture-software-kt.md` state that non-UI Daptin backend operations must use `daptin-cli`, not SQL, `curl`, inline scripts, or custom HTTP probes.

Why this matters:

These scripts are not just historical docs; they are executable deployment material. Direct SQL against Daptin-owned tables bypasses Daptin's schema/action boundary, and the raw `/api/world` probes normalize a maintenance style the repo now explicitly forbids.

When it fails:

It fails during production deploy, emergency repair, or future backend permission changes. A maintainer may copy this pattern into local troubleshooting or app verification and create a second, unsupported backend control path.

What not to do:

Do not add more psql patches or `curl` Daptin probes to deployment or local scripts. Do not "fix" this by moving permission constants into frontend code.

Why not:

Daptin owns those rows and actions. Mutating them below Daptin makes the actual deployed access model hard to review and hard to reproduce through the supported CLI boundary.

Recommended repair:

Move the permission repair into schema/provisioning that is applied through `daptin-cli`, or explicitly document a narrow deployment-only exception approved for those scripts. Replace `/api/world` health checks with a supported Daptin CLI readiness command if available; if the CLI lacks that capability, file it against the CLI rather than spreading raw probes.

### 3. There Is No Supported Automated Integration Gate For The Highest-Risk Product Paths

Where:

- `package.json:6-18` defines `verify:fast` and `verify:static`, but no supported browser, Daptin, live transport, asset upload/download, or accessibility gate.
- `docs/README.md:64-89` says `verify:fast` is TypeScript plus diff hygiene only and explicitly does not prove Daptin integration, live transport, asset upload/download, or production auth behavior.
- `docs/architecture-software-kt.md:412-431` states the same verification gap.

Why this matters:

The riskiest code paths are account/session, Daptin documents, visibility actions, live transport, file assets, nested canvas interactions, and preview capture. The current required gate does not exercise them. TypeScript passing is necessary but not enough for this product.

When it fails:

It fails after apparently safe refactors in `App.tsx`, `useWorkspaceAssets.ts`, `useDocumentLiveConnection.ts`, Daptin adapters, or the nested canvas runtime. The regression will appear in browser flows, not in `tsc`.

What not to do:

Do not revive old direct-backend smoke scripts or start new custom HTTP probes. Do not run `npm run build` as a substitute in this workflow; local instructions forbid it and build output would still not prove app behavior.

Why not:

The backend operation rules are strict, and build success does not exercise Daptin account/document/asset flows.

Recommended repair:

Add a rule-compliant integration verification path using the running app UI for account/document flows and `daptin-cli` for non-UI backend setup. Include at least save/open round trip, visibility action, asset upload/download, live document event handling, and one nested canvas interaction.

### 4. `App.tsx` Still Owns Too Many Product Workflows

Where:

- `src/ui/App.tsx:24-135` imports Daptin document adapters, Daptin client/session helpers, browser storage, URL state, starter catalog, domain model helpers, canvas workspace types, asset hooks, export hooks, and panels.
- `src/ui/App.tsx:382-451` owns refs and state for storage restoration, URL state, document open requests, account popover, menus, documents, active document, title, sync, and workspace chrome.
- `src/ui/App.tsx:662-813` owns document refresh/open/share-link restore behavior.
- `src/ui/App.tsx:815-887` owns browser `popstate` URL restoration and shared document opening.
- `src/ui/App.tsx:931-986` owns the full online save sequence: local flush, local asset promotion, preview capture, preview upload, Daptin create/update, local mirror update, URL update, and document refresh.
- `src/ui/App.tsx:1039-1405` owns multiple floating menu position/listener systems.

Why this matters:

The file is no longer only a React shell. It is the document lifecycle coordinator, URL router, account entry coordinator, save pipeline, asset promotion caller, preview upload caller, menu controller, and canvas composition root. The existing hooks help, but major workflow state still crosses through one component.

When it fails:

It fails during ordinary product growth: changing save behavior can affect URL state, asset promotion, sync messages, account recovery, or agent access because they all share refs and status state in this one file.

What not to do:

Do not move this into `domain`; it talks to Daptin, browser storage, DOM, clipboard, and React. Do not split it by arbitrary line count.

Why not:

The problem is workflow ownership, not file length alone. Moving browser/backend concerns into pure layers would violate the main architecture rule.

Recommended repair:

Extract a focused document lifecycle hook/use-case for open/restore/save/new/share-url restoration. Keep `App.tsx` as the composition shell, but make document lifecycle, floating menu state, URL state, and online save sequencing separately reviewable.

## Medium Severity Findings

### 5. `NativeNestedCanvasController.ts` Is A Runtime/Persistence/Debug Monolith

Where:

- `src/ui/canvas/nested/NativeNestedCanvasController.ts:1-80` imports domain model/history/commands, browser storage, URL-state types, engine slots, DOM toolbar helpers, parent context layout, theme helpers, keyboard helpers, and asset service types.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:820-847` loads/replaces/persists workspace snapshots and writes browser storage.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:861-883` restores from browser storage.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:1682-1784` mutates view state, mirrors snapshots, commits history, emits changes, and transitions canvases.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:1988-2018` captures preview images by composing visible canvases.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:1905-1933` exposes a debug API on `window`.

Why this matters:

The controller is a critical runtime object and now also owns local persistence handoff, debug API shape, preview capture, engine slot lifecycle, parent-context panes, history commits, and URL camera conversion. That makes it hard to test or change one behavior without reading the whole runtime.

When it fails:

It fails when changing nested navigation, local autosave, preview capture, or parent-context behavior. A storage change can accidentally disturb engine lifecycle; a layout change can disturb saved view state.

What not to do:

Do not move DOM/canvas lifecycle into `domain`. Do not add Daptin or account behavior here.

Why not:

`domain` must remain pure, and the nested controller is already at the edge of too many responsibilities.

Recommended repair:

Extract browser-storage handoff behind a small UI/infra port and move debug API wiring behind an explicit development/debug module. Keep engine slot and DOM lifecycle in UI.

### 6. The Nested Workspace Public Handle Depends On Browser URL Infra Types

Where:

- `src/ui/canvas/nested/NestedCanvasWorkspaceTypes.ts:9` imports `WorkspaceUrlState` from `src/infra/browser/workspaceUrlLocation`.
- `src/ui/canvas/nested/NestedCanvasWorkspaceTypes.ts:95-96` exposes `openWorkspaceUrlState` and `currentWorkspaceUrlState` on the workspace handle.
- `src/ui/canvas/nested/NativeNestedCanvasController.ts:76` also imports URL state types from browser infra.

Why this matters:

The earlier React/controller type cycle has been fixed, and `madge` reports no cycles. The remaining issue is type ownership: a nested canvas public handle now depends on a browser URL serialization type. That makes URL concerns part of the nested canvas API instead of an adapter at the app shell boundary.

When it fails:

It fails when URL format changes, when the nested workspace is reused in another host, or when view-state serialization needs to be tested independently of browser location state.

What not to do:

Do not reintroduce the old `NestedCanvasWorkspace.tsx` <-> `NativeNestedCanvasController.ts` cycle. Do not put URL parsing in `domain`.

Why not:

The cycle was real debt and is now gone. URL parsing is browser infra, not model semantics.

Recommended repair:

Define a pure workspace view-state DTO in `domain` or a UI-local contract module, then let `workspaceUrlLocation.ts` convert between that DTO and URL query/path state.

### 7. Asset Workflow Is Centralized In One Large Hook With Mixed Responsibilities

Where:

- `src/ui/useWorkspaceAssets.ts:84-220` creates the node asset service, preloads image assets, releases runtime resources, and handles file drops.
- `src/ui/useWorkspaceAssets.ts:222-297` decides local-vs-Daptin storage, loads asset objects/files, handles object URL release, and releases PDF/image runtime caches.
- `src/ui/useWorkspaceAssets.ts:299-315` uploads workspace preview images.
- `src/ui/useWorkspaceAssets.ts:362-428` promotes local assets to Daptin assets and rewrites asset ids through the full snapshot history.

Why this matters:

The node type boundary has improved: node modules now depend on `CanvasNodeAssetService` rather than importing Daptin/local infra directly. The debt has moved into a single hook that owns storage policy, runtime cache lifecycle, file-drop product behavior, preview upload, and snapshot rewriting.

When it fails:

It fails when changing offline/online behavior, adding another file type, changing asset visibility, or altering save semantics. These operations are coupled through one hook and shared helper exports.

What not to do:

Do not put asset storage into node definitions or `domain`. Do not embed file bytes into workspace snapshots.

Why not:

Node definitions should stay about canvas behavior; large bytes belong outside snapshots.

Recommended repair:

Split the hook by responsibility: runtime asset service, file-drop-to-node creation, preview image upload, and local-asset promotion. Keep Daptin/local implementations in infra and inject them through the UI composition boundary.

### 8. Dormant Adapter APIs Exposed Unsupported Product Paths

Where:

- `src/infra/daptin/canasterDocuments.ts` previously exported unused compatibility wrappers and a low-level `deleteDocument` adapter.
- `src/infra/browser/workspaceStorage.ts` previously exported unused `clearWorkspaceSnapshot`.
- `src/infra/browser/localAssets.ts` previously exported unused `saveLocalImageAsset`.

Why this matters:

Exported adapter functions looked like supported product paths even when no UI journey, access behavior, confirmation flow, or local fallback existed. `deleteDocument` was the biggest hazard because product fallback, active-document behavior, confirmation, and local state were explicitly not defined.

When it fails:

It fails when a maintainer wires a dormant function into UI without designing the complete journey and access behavior.

What not to do:

Do not add delete UI just because an adapter can delete a row. Do not keep unused compatibility wrappers when there are no current source callers and no product decision to support them.

Why not:

Product exposure requires more than an adapter call. Without a supported journey, an exported low-level operation is misleading surface area.

Recommended repair:

Remove unused compatibility exports and unsupported product-path adapters from the current source surface. Reintroduce document deletion only with an explicit product journey covering confirmation, owner/access errors, active-document fallback, local draft state, live refresh behavior, and retry messaging.

### 11. Current Documentation Mixed Current Contracts With Historical Plans - Repaired 2026-07-03

Where:

- `docs/README.md:5-18` now names the current contract set: `PRODUCT.md`, `DESIGN.md`, `docs/architecture-software-kt.md`, `docs/canaster-user-journeys.md`, and `docs/README.md`.
- `docs/README.md:13-15` keeps this report as current audit evidence, not as a replacement architecture contract.
- `docs/nested-canvas-ux-plan.md:5-9` now says the plan is historical and must not be followed for current source paths, verification commands, or implementation sequence.
- `docs/daptin-canaster-architecture-plan.md:3-8` now says the plan is historical for paths/adapter names/sequence and points readers to `src/infra/daptin/*` for the current Daptin implementation boundary.
- `docs/implement-daptin-document-persistence-goal-prompt.md:3-5` now marks the goal prompt historical and calls out old `src/engine/*`, `src/backend/*`, and `scripts/daptin-smoke.mjs` references.
- `docs/daptin-document-persistence-progress.md:3-6` now marks the progress report historical and calls out old source paths, scripts, probes, and `npm run build` evidence as historical only.

Why this matters:

The docs index must separate current contracts from provenance. Historical plans are useful only when they cannot be mistaken for live implementation instructions.

When it fails:

Before the repair, this failed during onboarding, architecture planning, and review because old path plans could look authoritative.

What not to do:

Do not use historical goal prompts as current architecture. Do not fix docs by deleting all history without preserving provenance.

Why not:

History is useful, but it must not masquerade as current source of truth.

Recommended repair:

Completed. Keep the historical banners in place and do not promote historical plan/progress docs back into the current contract set without updating their paths, verification rules, and source-boundary claims.

## Low Severity Findings

### 12. Raw Live Event Logging Remains In Runtime Source

Where:

- `src/ui/workspaceDocumentWorkflow.ts:89-92` logs `Get document id from` and the full live event payload.

Why this matters:

Live event payloads can include document metadata. Always-on logging makes the browser console noisy and can leak useful debugging details into screenshots or support traces.

When it fails:

It fails during normal live document event handling.

What not to do:

Do not replace it with another always-on log.

Why not:

The repo already has gated debug logging patterns elsewhere.

Recommended repair:

Remove the log or route it through an explicit development-only debug logger.

### 13. Formatting And Lint Gates Are Still Under-Specified

Where:

- `package.json:6-18` has TypeScript and audit checks but no formatter, lint, or general test command.
- Import spacing and quote style vary across source files, for example `src/ui/App.tsx` uses both tightly spaced named imports and spaced named imports.

Why this matters:

The project relies on TypeScript and human review for style and maintainability. In large files, style churn makes behavior changes harder to review.

When it fails:

It fails during broad refactors of `App.tsx`, `CanvasEngine.ts`, `NativeNestedCanvasController.ts`, and node type modules.

What not to do:

Do not mass-format the repo while the worktree contains unrelated user changes.

Why not:

Formatting churn would obscure real behavior changes and could trample in-progress work.

Recommended repair:

Add a small agreed formatting/lint gate in a separate change after architectural hot spots are stabilized.

## Findings From The Older Report That Are No Longer Current

- The app-layer agent bridge no longer imports Daptin or UI concrete modules directly. `src/app/agentBridge/CanasterAgentBridge.ts` now depends on `CanasterAgentLiveTransport`, `CanasterAgentWorkspace`, `CanasterAgentNodeMetadata`, and `CanasterAgentTimer` ports from `CanasterAgentBridgePorts.ts`.
- The nested workspace/controller import cycle is gone. `madge` reports no circular dependencies, and shared types now live in `src/ui/canvas/nested/NestedCanvasWorkspaceTypes.ts`.
- UI node types no longer directly import Daptin/local asset infra for image/PDF file handling. They use `CanvasNodeAssetService`.
- PDF preview caches are now bounded and have explicit release paths in `src/ui/canvas/nodeTypes/pdfCanvasPreview.ts:16-17`, `src/ui/canvas/nodeTypes/pdfCanvasPreview.ts:280-296`, and `src/ui/useWorkspaceAssets.ts:288-297`.
- `docs/architecture-software-kt.md` has been updated and now reflects the current `core/domain/app/infra/ui` source layout and Daptin boundary.
- Stale direct Daptin smoke scripts referenced in the older report are no longer present in `package.json` or `scripts/`; the remaining direct backend operations are in deployment material and historical docs.

## Confirmed Healthy Constraints

- `src/domain` has no imports from `src/infra`.
- `npx madge --extensions ts,tsx --circular src` found no cycles.
- `npx madge --extensions ts,tsx --orphans src` now reports only expected entry/environment files.
- `npm run verify:fast` passes.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- Online document persistence continues to use Daptin's built-in `document` row through `src/infra/daptin/canasterDocuments.ts`; no parallel workspace table is present in current source.
- Visibility changes go through schema-managed Daptin actions in `src/infra/daptin/canasterDocuments.ts` and `src/infra/daptin/assets.ts`, not generic JSON:API permission patches from UI.
- Node asset handling has a service boundary (`src/ui/canvas/nodeAssetService.ts`) instead of Daptin imports inside image/PDF node definitions.
- UI workflow types are now explicit imports from `src/ui/workspaceWorkflowTypes.ts`; the ambient `src/core/Enums.ts` file has been removed.
- The unused `actionRouting`, `createTextStylePanel`, and `ThemeSwitcher` modules, plus their private CSS selectors, have been removed.

## Recommended Repair Order

1. Replace the token-in-URL agent access model with a scoped capability, or explicitly constrain it as a local/developer feature until that exists.
2. Bring deployment scripts back inside the Daptin operation boundary, especially the direct `psql` action-permission patch.
3. Add a rule-compliant browser/Daptin/live/asset integration gate.
4. Extract document lifecycle and save/open/URL restoration from `App.tsx`.
5. Split `useWorkspaceAssets.ts` into runtime asset service, file-drop node creation, preview upload, and local-asset promotion units.
6. Move nested workspace URL-state types behind a pure view-state DTO and keep browser URL serialization outside the nested workspace handle.
7. Extract browser-storage handoff and debug API wiring from `NativeNestedCanvasController.ts`.
8. Remove the raw live event `console.log`.
9. Add formatting/lint gates in a separate, low-risk change.

## Bottom Line

The current codebase is not failing at the compiler or import-cycle level. The real risk is maintenance drift around large workflow objects, unsupported verification/deployment paths, credential sharing for agent access, and stale surfaces that look more official than they are. The docs cleanup reduced one of those stale-surface risks; the remaining repair work should preserve the current Daptin document/asset boundary and reduce coupling around existing behavior rather than inventing new persistence primitives.
