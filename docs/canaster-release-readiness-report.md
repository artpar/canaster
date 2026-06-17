# Canaster Release Readiness Report

Date: 2026-06-17

This report covers a real-user journey pass against the deployed production frontend at `https://canaster.in` and a release-candidate frontend running locally against the production backend at `https://api.canaster.in`.

## Verdict

Not production-ready yet.

The local/no-account canvas journeys are usable, and the release-candidate frontend fixes the sign-in model-loading failure and wrapped account errors. The real signed-in save/open journey is still blocked because production Daptin rejects normal-user `POST /api/document` with `403`.

## Test Setup

- Production frontend: `https://canaster.in`
- Production backend/API: `https://api.canaster.in`
- Release-candidate local frontend: `npm run dev:cloud -- --host 127.0.0.1`
- Real test account: created through production signup during this pass
- Test account email: `journey-20260617224349@canaster.in`
- Workspace title used in save attempt: `Journey RC 20260617224349`

## Journey Results

| Journey | Status | Evidence |
| --- | --- | --- |
| Start working without an account | Pass on production | Production opened the starter workspace, local-save status showed `Saved on this device`, no permanent login bar was present, and the bottom-left map was visible. |
| Move through a nested job | Pass on production | The bottom-left map opened `One job, four views`; the toolbar changed to level 2, the up command became available, and child map nodes remained visible. |
| Use Work Items | Pass on production | Work Items opened in the right utility drawer, then Documents replaced it instead of creating a second toolbar or stacked drawer. |
| Save online from a local draft | Blocked | Production signup/signin returned tokens, but deployed frontend stayed in error because it tried full `/api/world` model loading. The local release-candidate frontend fixed that, but the actual save failed at `POST /api/document` with `403`. |
| Open a saved workspace | Blocked | Cannot complete until normal users can create at least one online document. |
| Create a new workspace | Partial | Local draft creation remains usable. New online document creation is blocked by the same `POST /api/document` permission failure. |
| Return later on same device | Partial | Local restore remains in scope and available. Signed-in online restore cannot be completed until save/open succeeds. |
| Sign out | Pass on release candidate | After signing in on the release-candidate frontend, Sign out returned the toolbar to `Saved on this device`, changed Account back to Sign in, and kept the visible workspace. |
| Work on a small screen | Not fully tested | This pass did not complete a dedicated narrow-viewport run because the signed-in storage journey failed first. Long account errors were verified against the release-candidate CSS and now wrap. |
| Recover from account or save errors | Partial | The release-candidate Account popover shows the full error text without clipping. Failed online save keeps the local workspace visible and marks the save as failed. |

## Production Blockers

### 1. Deployed Frontend Fails Normal Sign-In/Signup Finalization

Production auth action calls returned successfully:

- `POST https://api.canaster.in/action/user_account/signup` returned `200`
- `POST https://api.canaster.in/action/user_account/signin` returned `200`

The token was written to browser storage, but the deployed frontend still showed an account error. The cause is that the deployed frontend calls full `worldManager.loadModels(false)`. A normal production user can load `/jsmodel/document.js`, but not the full `/api/world` table listing needed by full model loading.

Local fix in the release candidate:

- `src/backend/daptinClient.ts` now loads only the `document` model with `worldManager.loadModel('document', false)`.
- Failed model loading now resets the cached promise so retry can work.

### 2. Production Backend Blocks Real User Document Creation

After the local sign-in fix, the release-candidate frontend signed in successfully and reached `Ready to save online`.

The first real online save still failed:

- Request: `POST https://api.canaster.in/api/document`
- Result: `403`
- UI result: `Could not save this workspace. Check your connection and try again.`

Live production metadata for the built-in `document` table:

- `world.table_name`: `document`
- `world.reference_id`: `019ecca4-e56c-78e6-8a56-e1ed846a99ef`
- `world.permission`: `561441`
- decoded as `Guest: Peek, Execute`, `Owner: Read, Execute`, `Group: Read, Execute`
- `world.user_account_id`: admin account
- `world_schema_json.DefaultPermission`: `561441`
- `world_schema_json.DefaultGroups`: `administrators`

Daptin table-access source checks `CanCreate` on the `world` row before allowing `POST /api/document`. With the current production permission, a normal account is neither the table owner nor in a related group with create permission, so the `403` is expected.

Do not mark the release ready until this is resolved with a deliberate backend permission design. The quick unblock would be adding `GuestCreate` to the table permission (`561445`), but that also permits anonymous API clients to create document rows. That may be acceptable only if we explicitly accept guest document-create abuse risk or add separate controls.

## Local Fixes Ready For Commit

- Account error text wraps instead of being clipped in the Account popover.
- Frontend auth/document model loading no longer requires full `/api/world` visibility.
- Model-loading failures can be retried.
- User journeys are documented in `docs/canaster-user-journeys.md`.

## Required Release Gate

Before release, run this exact real-user gate:

1. Open `https://canaster.in` in a fresh browser profile.
2. Start from signed out state.
3. Create a new account or sign in with a normal non-admin account.
4. Click Save online on a local draft.
5. Confirm `POST /api/document` returns success, the UI says saved, and Documents lists the new workspace.
6. Reload the page and confirm the same workspace restores.
7. Sign out and confirm the visible workspace remains available locally.

