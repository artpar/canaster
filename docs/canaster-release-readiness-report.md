# Canaster Release Readiness Report

Date: 2026-06-18

This report covers a real-user journey pass against the deployed production frontend at `https://canaster.in`, plus a fixed release-candidate frontend running locally against the production backend at `https://api.canaster.in`.

## Verdict

Core production storage release path verified. The earlier backend hardening item is closed.

The local/no-account canvas journeys are usable. The deployed frontend no longer requires normal users to load the full Daptin world model, account errors wrap instead of clipping, and signed-in reload/open restore works. Production Daptin now admits `document` create/update only for authenticated users in the built-in `users` usergroup. Anonymous clients cannot create, read, or patch private saved workspaces.

## Test Setup

- Production frontend: `https://canaster.in`
- Production backend/API: `https://api.canaster.in`
- Release-candidate local frontend: `npm run dev:cloud -- --host 127.0.0.1`
- Real test account: created through production signup during this pass
- Test account email: `fix-20260618-0022@canaster.in`
- Workspace title used in save/open/reload verification: `Fix-Journey-After-Restart-20260618-0022`

## Journey Results

| Journey | Status | Evidence |
| --- | --- | --- |
| Start working without an account | Pass on production | Production opened the starter workspace, local-save status showed `Saved on this device`, no permanent login bar was present, and the bottom-left map was visible. |
| Move through a nested job | Pass on production | The bottom-left map opened `One job, four views`; the toolbar changed to level 2, the up command became available, and child map nodes remained visible. |
| Use Work Items | Pass on production | Work Items opened in the right utility drawer, then Documents replaced it instead of creating a second toolbar or stacked drawer. |
| Save online from a local draft | Pass on production | A normal production account signed in, created a `document` row with `POST /api/document [201]`, patched it private/content with `PATCH /api/document/<id> [200]`, and ended at `Saved online`. |
| Open a saved workspace | Pass on production | Documents listed the saved workspace, selecting it restored the snapshot and kept the toolbar title aligned with the document title. |
| Create a new workspace | Pass on release candidate | New starts a local draft and does not create an online row until Save online is explicitly used. |
| Return later on same device | Pass on production | A hard reload restored the signed-in session, active document id, workspace snapshot, document title, and `Saved online` status. |
| Sign out | Pass on release candidate | After signing in on the release-candidate frontend, Sign out returned the toolbar to `Saved on this device`, changed Account back to Sign in, and kept the visible workspace. |
| Work on a small screen | Not fully tested | This pass did not complete a dedicated narrow-viewport run because the focus was the signed-in storage blocker. Long account errors were verified against the release-candidate CSS and now wrap. |
| Recover from account or save errors | Partial | The release-candidate Account popover shows the full error text without clipping. Failed online save keeps the local workspace visible and marks the save as failed. |

## Fixed Production Blockers

### 1. Deployed Frontend Fails Normal Sign-In/Signup Finalization

The deployed production frontend still has the old behavior until the release-candidate commit is deployed. Production auth action calls returned successfully:

- `POST https://api.canaster.in/action/user_account/signup` returned `200`
- `POST https://api.canaster.in/action/user_account/signin` returned `200`

The token was written to browser storage, but the deployed frontend still showed an account error. The cause is that the deployed frontend calls full `worldManager.loadModels(false)`. A normal production user can load `/jsmodel/document.js`, but not the full `/api/world` table listing needed by full model loading.

Fix in the release candidate:

- `src/backend/daptinClient.ts` now loads only the `document` model with `worldManager.loadModel('document', false)`.
- Failed model loading now resets the cached promise so retry can work.

### 2. Production Backend Authenticated Document Creation

After the local sign-in fix, the release-candidate frontend signed in successfully and reached `Ready to save online`. The backend then needed table-level document create/update admission for normal accounts.

Original failing request:

- Request: `POST https://api.canaster.in/api/document`
- Result: `403`
- UI result: `Could not save this workspace. Check your connection and try again.`

Current live production metadata for the built-in `document` table:

- `world.table_name`: `document`
- `world.reference_id`: `019ecca4-e56c-78e6-8a56-e1ed846a99ef`
- `world.permission`: `561408`
- decoded as `Guest: (none)`, `Owner: Read, Execute`, `Group: Read, Execute`
- `world.usergroup_id -> users` relation permission: `770048`
- decoded as `Group: Peek, Read, Create, Update, Execute`
- purpose: allow normal authenticated users in the built-in `users` usergroup to create/update `document` rows without granting anonymous table access
- `world.user_account_id`: admin account
- `world_schema_json.DefaultPermission`: `16256`
- `world_schema_json.DefaultGroups`: `administrators`

Daptin table-access checks the `world` row before allowing `POST` and `PATCH` on `document`. The correct production shape is not anonymous table create/update. The `document` world row is related to the built-in `users` usergroup, and the relation row carries the group create/update bits. New rows still default to `16256`, so saved workspaces remain private to their owner unless a later sharing feature intentionally changes row permission.

Correct relation update path:

- Add or update `world.usergroup_id -> users` through the JSON:API relationship route:
  `PATCH /api/world/<document_world_ref>/relationships/usergroup_id`.
- Include the relation data object with `type: "usergroup"`, the `users` group id, and `attributes.permission=770048`.
- Do not use anonymous `GuestCreate`/`GuestUpdate` bits to make the save path work.
- Do not treat generated join-table entity names as the operator-facing workflow; use the relationship route and verify with `GET /api/world/<document_world_ref>/usergroup_id`.

Final privacy checks:

- Anonymous `POST /api/document` returned `403`.
- Anonymous `GET /api/document/<id>` returned `403`.
- Anonymous `PATCH /api/document/<id>` returned `403`.
- Normal signed-in browser save returned `POST /api/document [201]`, then two `PATCH /api/document/<id> [200]` calls.
- Normal signed-in reload restored the active saved workspace with `GET /api/document/<id> [200]`.
- The backend and browser probe rows were deleted after verification.

The earlier failed placeholder rows from the broken permission attempts were deleted from production after verification.

## Local Fixes Ready For Commit

- Account error text wraps instead of being clipped in the Account popover.
- Frontend auth/document model loading no longer requires full `/api/world` visibility.
- Model-loading failures can be retried.
- Signed-in reload restores the active Daptin document directly before refreshing the document list.
- Daptin document loads return the document title with the snapshot, so the toolbar title stays aligned after direct reload/open.
- User journeys are documented in `docs/canaster-user-journeys.md`.

## Required Release Gate

Before calling production released, run this exact real-user gate against the deployed frontend:

1. Open `https://canaster.in` in a fresh browser profile.
2. Start from signed out state.
3. Create a new account or sign in with a normal non-admin account.
4. Click Save online on a local draft.
5. Confirm `POST /api/document` returns success, the UI says saved, and Documents lists the new workspace.
6. Reload the page and confirm the same workspace restores.
7. Sign out and confirm the visible workspace remains available locally.
