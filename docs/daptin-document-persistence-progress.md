# Daptin Document Persistence Progress

Status: implemented and locally verified.
Date: 2026-06-15.

## Summary

Canaster now has MVP signed-in persistence through the existing Daptin built-in `document` entity.

The backend remains an implementation detail. The user-facing UI says "Documents", "Save", "Saved", and similar product language. It does not expose "Daptin" in visible document controls or status text.

No custom Canaster persistence entity was added. The MVP does not use `canaster_document`, `space`, `plane`, or `snapshot`.

## Shell UX Update - 2026-06-17

- The app uses one persistent top command bar for workspace title, New, Open, Save online, canvas navigation, view controls, theme, Work Items, and Account.
- Account fields are no longer inline in the toolbar. Sign in, sign up, and sign out live in a toolbar-launched account popover.
- Open uses the same right-side utility drawer slot as Work Items. Only Documents or Work Items is visible at a time.
- Local autosave remains available without an account. Save online is always visible; signed-out users are prompted to sign in, and signed-in users create or update the active Daptin-backed document.
- New starts a local draft first. First remote save creates the Daptin document, then later saves update it.

## Implemented

- Added `src/backend/daptinClient.ts`.
  - Creates one `DaptinClient`.
  - Reads `VITE_DAPTIN_ENDPOINT`, defaulting to `http://localhost:6336`.
  - Owns token storage through `canaster:daptin:token`.
  - Loads Daptin models before JSON:API document operations.

- Added `src/backend/canasterDocuments.ts`.
  - Exposes Canaster-facing auth and document operations.
  - Uses `daptin-client` for auth and built-in `document` CRUD.
  - Keeps Daptin file-array encode/decode isolated in this adapter.
  - Stores the full `CanvasWorkspaceSnapshot` as one `application/json` file blob in `document.document_content`.
  - Uses the placeholder-create, private-permission patch, real-content patch flow.

- Updated `src/App.tsx`.
  - Added compact account/document controls in the shell topbar.
  - Supports sign up, sign in, sign out, document create, document select, document refresh, and save.
  - Keeps backend-specific wording out of visible UI.
  - Restores signed-in token and active document on reload.
  - Keeps anonymous local draft behavior for signed-out users.

- Updated `src/engine/nested/NestedCanvasWorkspace.tsx`.
  - Added typed handle methods to get, load, and flush full workspace snapshots.
  - Kept backend concerns outside the recursive canvas workspace.

- Updated `scripts/daptin-smoke.mjs`.
  - Uses `daptin-cli` for local operator/auth setup.
  - Uses `daptin-client` for built-in `document` create/update/read.
  - Can run against an isolated temporary Daptin instance or the permanent local Compose endpoint.

- Removed stale app schema from local/prod Daptin startup.
  - `daptin/schema_canaster.yaml` is deleted.
  - `deploy/daptin/Dockerfile` now creates an empty schema folder for MVP app state.

## Verified Commands

These gates passed after implementation:

```bash
npm run daptin:up
npm run daptin:smoke:local
npm run build
npm run probe:nested
git diff --check
```

`npm run daptin:smoke:local` result:

```json
{
  "baseUrl": "http://localhost:6336",
  "runtime": "existing-endpoint",
  "dbType": "external",
  "documentRef": "019ecc79-63b3-7703-8e4d-e0c560e62907",
  "privatePermission": 16256,
  "publicPermission": 16259,
  "decodedActiveCanvasId": "root",
  "decodedNodeCount": 1
}
```

`npm run build` passed. Vite emitted only the bundle-size warning for the larger SDK-backed client chunk.

`npm run probe:nested` passed, including nested canvas interaction, recursive live previews, border panes, persistence, undo/redo, and console-error checks.

## Browser E2E Evidence

The browser flow was run against:

```text
Frontend: http://127.0.0.1:5179
Backend:  http://localhost:6336
```

Test account:

```text
e2e-1781575790000@canaster.local
```

Created document:

```text
019ecc71-7207-7dce-b47d-963cb63de3a3
```

Verified in browser:

- Anonymous mode starts as a local draft.
- Sign up works through the local backend.
- Create document works and selects the new document.
- Root canvas zoom/view changes persisted.
- Child canvas was entered and edited.
- Save writes to built-in `document`.
- Reload restores the signed-in session and active document.
- Decoded backend payload exactly matched the live workspace snapshot.
- Sign out removes token and active document selection.
- Signed-out reload returns to local draft mode.
- Signing back in lists the saved document and opening it restores the saved state.
- Visible UI body text did not contain `Daptin`.
- Browser network used `http://localhost:6336/api/document`.
- No app-owned `/api` route was used.

Decoded document payload evidence:

```json
{
  "schemaVersion": 1,
  "activeCanvasId": "root",
  "undoStackLength": 4,
  "childX": -64,
  "sameAsLive": true
}
```

## Entity Check

`/api/world` contains Daptin's built-in `document`.

The stale/custom MVP entities are absent:

```text
canaster_document
space
plane
snapshot
```

Daptin's own built-in system and relation tables are still present, as expected.

## Current Local State

Local Compose services are running:

```text
canaster-daptin-1    daptin/daptin:v0.12.17    http://localhost:6336
canaster-postgres-1  postgres:16                healthy
```

The temporary Vite dev server used for browser E2E was stopped after verification.

## Files Changed

- `src/backend/daptinClient.ts`
- `src/backend/canasterDocuments.ts`
- `src/App.tsx`
- `src/engine/nested/NestedCanvasWorkspace.tsx`
- `src/styles.css`
- `scripts/daptin-smoke.mjs`
- `package.json`
- `daptin/README.md`
- `deploy/daptin/Dockerfile`
- `docs/daptin-backend-groundwork.md`
- `docs/daptin-canaster-architecture-plan.md`
- `docs/implement-daptin-document-persistence-goal-prompt.md`
- `daptin/schema_canaster.yaml` removed

## Remaining Follow-Ups

- Commit the current implementation and setup changes.
- Decide whether to code-split the SDK-backed document/account shell later; this is only a bundle-size warning, not a functional failure.
- Remove old public smoke documents from the local development database if the document dropdown should stay clean during manual testing.
- Production endpoint wiring should be handled through deployment config. The product UI should continue to avoid backend-provider wording.
