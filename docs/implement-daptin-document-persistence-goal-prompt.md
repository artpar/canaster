# Goal Prompt: Implement Daptin Document Persistence MVP

Status: historical goal prompt. Do not follow this document for current source paths, scripts, backend verification commands, or implementation sequence.

Current source uses `src/domain`, `src/infra`, and `src/ui/canvas`; the old `src/engine/*`, `src/backend/*`, and `scripts/daptin-smoke.mjs` references below are historical. Use `docs/README.md`, `docs/architecture-software-kt.md`, `PRODUCT.md`, `DESIGN.md`, and `docs/canaster-user-journeys.md` as the current contract set.

You are working in `/Users/artpar/workspace/code/canway`.

Your goal is to implement and verify end-to-end signed-in persistence for Canaster using the real local Daptin setup at `http://localhost:6336`, exactly as a real user would use it in the browser.

The MVP backend target is Daptin's existing built-in `document` entity. Do not create any new Daptin entity, app table, backend service, custom API server, or normalized persistence model.

## Starting Point

Read and verify these first:

- `docs/daptin-canaster-architecture-plan.md`
- `docs/daptin-backend-groundwork.md`
- `daptin/README.md`
- `scripts/daptin-smoke.mjs`
- `package.json`
- `src/App.tsx`
- `src/engine/nested/NestedCanvasWorkspace.tsx`
- `src/engine/workspaceStorage.ts`
- `src/engine/workspaceHistory.ts`
- `src/engine/documentTypes.ts`
- `node_modules/daptin-client/dist/clients/authmanager.d.ts`
- `node_modules/daptin-client/dist/types/jsonapi.d.ts`

Do not proceed from memory. Confirm the current checkout and current local Daptin behavior.

## Non-Negotiable Backend Contract

- Use only Daptin built-in `document`.
- Do not add or re-add `daptin/schema_canaster.yaml`.
- Do not add `canaster_document`.
- Do not add `space`, `plane`, `snapshot`, relationship tables, collaboration tables, or sharing tables.
- Do not implement private sharing.
- Do not implement YJS or collaboration.
- Do not use raw `fetch` for app-facing Daptin CRUD or auth unless you prove the required SDK method does not exist and document the exact SDK gap. The expected path is `daptin-client`.
- Do not put Daptin concerns inside `CanvasEngine`, `documentModel`, `workspaceHistory`, or the recursive canvas renderer.

The signed-in durable save target is:

```ts
document.document_content = JSON.stringify([
  {
    name: '<document>.canaster.json',
    file: 'data:application/json;base64,<CanvasWorkspaceSnapshot json bytes>',
    type: 'application/json',
  },
]);
```

The file payload is exactly `CanvasWorkspaceSnapshot`. It must include `history.present`, `history.undoStack`, `history.redoStack`, cameras, selections, pane layouts, nested canvas documents, and `lastModelChange`.

## Required Architecture

Add `src/backend/daptinClient.ts`.

It must:

- create one typed `DaptinClient`;
- read the endpoint from `import.meta.env.VITE_DAPTIN_ENDPOINT`, defaulting to `http://localhost:6336`;
- own token storage with key `canaster:daptin:token`;
- expose `getToken()`, `setToken(token)`, `clearToken()`, and `getDaptinClient()`;
- call `client.worldManager.loadModels()` once before JSON:API document operations;
- use `client.authManager.signup(name, email, password, passwordConfirm)`;
- use `client.authManager.signin(email, password)`;
- use `client.authManager.extractToken(response)` to extract the JWT;
- not export a mutable global token variable.

Add `src/backend/canasterDocuments.ts`.

It must expose only this Canaster-facing API:

```ts
export type CanasterDocumentSummary = {
  id: string;
  title: string;
  path: string;
  permission: number;
  updatedAt: string | null;
};

export async function signUp(input: { name: string; email: string; password: string }): Promise<void>;
export async function signIn(input: { email: string; password: string }): Promise<void>;
export async function signOut(): Promise<void>;
export async function listDocuments(): Promise<CanasterDocumentSummary[]>;
export async function createDocument(title: string, snapshot: CanvasWorkspaceSnapshot): Promise<string>;
export async function loadDocument(documentRef: string): Promise<CanvasWorkspaceSnapshot>;
export async function saveDocument(documentRef: string, snapshot: CanvasWorkspaceSnapshot): Promise<void>;
export async function makeDocumentPrivate(documentRef: string): Promise<void>;
export async function makeDocumentPublic(documentRef: string): Promise<void>;
export async function deleteDocument(documentRef: string): Promise<void>;
```

Only `canasterDocuments.ts` may encode or decode Daptin file arrays.

Use these SDK calls:

- `client.jsonApi.findAll('document', ...)`
- `client.jsonApi.find('document', documentRef)`
- `client.jsonApi.create('document', payload)`
- `client.jsonApi.update('document', { id: documentRef, ...payload })`
- `client.jsonApi.destroy('document', documentRef)` if the runtime method works; if it does not, prove the SDK gap and implement the smallest documented fallback in this adapter only.

Important SDK detail already verified locally: `daptin-client@0.7.12` runtime `jsonApi.update` expects `{ id, ...payload }`, not the three-argument signature shown in the type file.

## Required Create Flow

Because Daptin creates built-in `document` rows with broad default permission, create must use this exact sequence:

1. Create a placeholder document:
   - `document_name`: `pending.canaster.json`
   - `document_path`: `/canaster/pending/<clientDocumentKey>.canaster.json`
   - `document_extension`: `json`
   - `mime_type`: `application/json`
   - `document_content`: harmless pending JSON file blob
2. Immediately update the row to `permission: 16256`.
3. Update the same row with real title, path, and full workspace snapshot content:
   - `document_name`: `<safeTitle>.canaster.json`
   - `document_path`: `/canaster/documents/<documentRef>.canaster.json`
   - `document_extension`: `json`
   - `mime_type`: `application/json`
   - `document_content`: full snapshot file blob

Private permission is `16256`.

Public-readable permission is `16259`.

## Required App Behavior

Implement a minimal document/account shell outside `NestedCanvasWorkspace`.

The recursive canvas workspace must stay focused on canvas state and engine interaction. It may expose or receive typed snapshots/collection state through props/handles, but it must not import Daptin code.

The user must be able to:

- sign up from the browser using local Daptin;
- sign in from the browser using local Daptin;
- create a Daptin-backed document from the current workspace;
- see which document is active;
- save the active document;
- reload the page and restore the active Daptin document instead of resetting to the default sample;
- sign out and return to anonymous local draft behavior.

Persistence behavior:

- anonymous mode keeps using existing Dexie/localStorage draft persistence;
- signed-in mode saves a local mirror first, then saves the selected Daptin document;
- failed Daptin saves must leave the local mirror intact and show a dirty/error state in shell chrome;
- switching documents must load the selected Daptin document into the workspace;
- reloading while signed in must restore token, active document id, and loaded workspace snapshot.

Use these local storage keys:

- `canaster:daptin:token`
- `canaster:daptin:active-document`
- `canaster:daptin:last-email`

## Required UI Shape

Keep the UI pragmatic and compact.

- Add account controls to the existing topbar, not inside `NestedCanvasWorkspace`.
- Add document controls to the existing topbar or a small shell panel outside `NestedCanvasWorkspace`.
- Do not add a landing page.
- Do not add marketing copy.
- Do not add cards of documents over the canvas.
- Do not block normal canvas panning, zooming, editing, nesting, undo, redo, or reload restoration.
- Use existing visual patterns and lucide icons where buttons need icons.

## Required Verification

Run these command gates:

```bash
git status --short --branch
npm run daptin:up
npm run daptin:smoke:local
npm run build
npm run probe:nested
```

Then run the real user browser flow:

```bash
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Use the browser against `http://127.0.0.1:5179`.

Perform these exact steps in the browser:

1. Clear site storage for `127.0.0.1:5179`.
2. Load the app.
3. Confirm the app starts in anonymous local mode with the existing sample workspace.
4. Sign up with a unique email like `e2e-<timestamp>@canaster.local`.
5. Create a document named `E2E Workspace <timestamp>`.
6. Pan or zoom the root canvas.
7. Enter a child canvas by double-clicking a nested canvas node.
8. Pan or zoom the child canvas.
9. Make a visible edit that changes the workspace snapshot.
10. Save the document.
11. Reload the page.
12. Confirm the app restores the signed-in session and active document.
13. Confirm the restored workspace is not the default reset state:
    - active document id is present;
    - root camera/view state is restored;
    - child canvas state is restored;
    - edit is still visible;
    - undo/redo history is restored if an edit created history.
14. Sign out.
15. Reload.
16. Confirm signed-out mode does not load the private Daptin document as guest.
17. Sign in again with the same email/password.
18. Confirm the same document can be opened and the saved state returns.

Also inspect Daptin directly:

```bash
curl -s 'http://localhost:6336/api/world?page%5Bsize%5D=500' | jq -r '.data[].attributes.table_name' | sort
```

The output must include `document` and must not include:

- `canaster_document`
- `space`
- `plane`
- `snapshot`

Use the browser network panel or a targeted script to prove app requests go to `/api/document` and `/action/user_account/...` on `http://localhost:6336`. There must be no Canaster-owned backend API.

## Required Evidence In Final Report

When done, report:

- files changed;
- exact command outputs for all gates;
- browser flow result;
- the test email used;
- the created Daptin document reference id;
- proof that the decoded Daptin `document_content` contains `CanvasWorkspaceSnapshot.schemaVersion === 1`;
- proof that stale/custom entities are absent from `/api/world`;
- any residual risk or unverified behavior.

Do not call the work complete if the browser flow only works through localStorage or IndexedDB. The saved state must round-trip through Daptin built-in `document`.
