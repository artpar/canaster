# Canaster Release Readiness Report

Date: 2026-06-21

This report covers the post-fix production release gate against:

- Frontend: `https://canaster.in`
- Backend/API: `https://api.canaster.in`
- Commit: `60a2640` (`Polish production release gate UI`)
- CI run: `27896448584` (`success`)
- Deploy run: `27896448583` (`success`)
- Browser mode: isolated fresh Chrome context through DevTools
- Test account: `prod-retest-20260621t065454z@canaster.in`
- Test workspace: `Prod Retest Workspace 20260621 0654`
- Saved document row: `019ee8f7-3558-777c-8669-0b6f9e1c9427`

## Verdict

Core production release path passes.

A fresh user can request email OTP from the deployed frontend, verify the code, save a local workspace online, reload the page, restore the same online workspace, and sign out without the previous camera refit jump. The deployed frontend uses the narrow Daptin document model path, not full `/api/world` loading.

The previous frontend dents are resolved in production:

- Sign-out keeps the current camera stable while changing account state to local.
- Narrow mobile toolbar keeps save status visible through the compact status chip.
- Save online collapses to an icon-only control on narrow screens.
- The bottom-left map remains usable but is scaled down on mobile.

Remaining release risk is recovery verification, not a happy-path blocker: this pass did not deliberately force token expiry, permission loss, network failure, or a failed document save after sign-in. A wrong OTP was previously verified to show safe readable copy; the backend returning `500` for that invalid-code action is API hygiene to fix, not a release blocker by itself.

## Journey Results

| Journey | Status | Evidence |
| --- | --- | --- |
| Start working without an account | Pass on production | Fresh context opened the starter workspace, showed `Saved on this device`, had no permanent login bar, and kept the bottom-left map visible. |
| Email OTP sign-in | Pass on production | Deployed UI sent OTP with `POST /action/user_account/request_canaster_email_otp [200]`, then verified it with `POST /action/user_account/verify_canaster_email_otp [200]` and reached `Ready to save online`. |
| Save online from a local draft | Pass on production | `POST /api/document [201]`, then `PATCH /api/document/<id> [200]` twice, ending at `Saved online`. |
| Return later on same device | Pass on production | Hard reload restored the signed-in session, active document id, workspace, canvas, and `Saved online` state. Reload used `GET /api/document/019ee8f7-3558-777c-8669-0b6f9e1c9427 [200]`. |
| Sign out | Pass on production | Sign out returned Account to `Sign in`, status to `Saved on this device`, and kept the visible workspace. Zoom stayed `11%` before and after sign-out. DOM geometry stayed stable: active canvas `0,0,500x844`; minimap `14,608,360x150`; main `0,0,500x844`. |
| Work on a small screen | Pass on production | At `390x844x2`, status chip was visible as `Local` (`74x28`), Save online collapsed to `34x28`, minimap scaled to `304x129`, toolbar stayed within `362px`, and `bodyScrollWidth` stayed `390`. |
| Recover from account or save errors | Partial | A wrong OTP previously produced readable copy: `Could not verify that code. Check the code and try again.` Token expiry, permission loss, network failure, and failed online save recovery were not forced in this production pass. |

## Production Network Evidence

Valid post-fix sign-in and save flow:

- `GET https://canaster.in/?gate=20260621-0654` -> `200`
- `GET https://canaster.in/assets/index-Cr-k7vBz.js` -> `200`
- `GET https://canaster.in/assets/index-DebiNee9.css` -> `200`
- `POST https://api.canaster.in/action/user_account/request_canaster_email_otp` -> `200`
- `POST https://api.canaster.in/action/user_account/verify_canaster_email_otp` -> `200`
- `GET https://api.canaster.in/jsmodel/document.js` -> `200`
- `GET https://api.canaster.in/api/document?page[size]=100&sort=-updated_at` -> `200`
- `POST https://api.canaster.in/api/document` -> `201`
- `PATCH https://api.canaster.in/api/document/019ee8f7-3558-777c-8669-0b6f9e1c9427` -> `200`
- `PATCH https://api.canaster.in/api/document/019ee8f7-3558-777c-8669-0b6f9e1c9427` -> `200`
- `GET https://api.canaster.in/api/document/019ee8f7-3558-777c-8669-0b6f9e1c9427` after reload -> `200`

Console during valid flow:

- No warnings or errors.

OTP mail evidence:

- Fresh OTP request created outbox row `019ee8f6-1ce2-7874-b9fc-7deb1fd6a3b6`.
- The stored outbox asset was available through Daptin asset storage.
- The UI-verified OTP came from that stored email asset.

## Production Data Evidence

Saved document:

- `document_name`: `Prod-Retest-Workspace-20260621-0654.canaster.json`
- `reference_id`: `019ee8f7-3558-777c-8669-0b6f9e1c9427`

Email OTP and mailbox provisioning were separately verified in production on 2026-06-21:

- New `user_account.permission`: `569633`
- New `mail_account.permission`: `569633`
- Six default `mail_box` rows, all `569633`
- Outbox processing delivered a `mail` row into the user's `INBOX`
- Signed-in user token could list `mail_account:1`, `mail_box:6`, `mail:1`
- Guest users saw no mailbox rows and received `403` for `/api/mail`

## Backend Access State

Document storage uses the Daptin-standard access shape:

- `world.permission(document)=1003779`
- `world.usergroup_id -> users` relation permission: `1032192`
- `world_schema_json.DefaultPermission(document)=16256`

This lets authenticated users in the built-in `users` group create/update/delete owned documents while keeping anonymous clients out and keeping new document rows private to the owner. Do not replace this with guest create/update/delete bits, and do not manipulate generated join tables directly.

Mailbox provisioning uses table defaults:

- `mail_account.DefaultPermission=569633`
- `mail_box.DefaultPermission=569633`
- Generated world/usergroup relation metadata is preserved through Daptin `v0.12.22`

The auth action must continue using normal entity foreign-key fields and supported Daptin actions. It must not write generated join-table entities directly.

## Fixed Production Blockers

- Deployed frontend no longer requires normal users to load full `/api/world`.
- Account error text wraps instead of clipping.
- Daptin document create/update/delete is available to authenticated users through the `users` group relation, not guest access.
- Email OTP request/verify works from production frontend.
- Daptin SMTP/outbox/mail storage works through Daptin-managed mail rows and GCS-backed assets.
- Sign-out no longer refits or shifts the canvas camera.
- Compact toolbar now keeps the sync state visible on mobile.
- Mobile minimap is smaller and no longer causes horizontal overflow.
- `daptin/daptin#225` is closed upstream in `v0.12.22`.
- `daptin/daptin#226` is closed as no longer needed after moving row permission policy to table defaults.

## Remaining Work

### 1. Re-Test API And Session Recovery

This pass verified valid save and wrong-code recovery, but did not force token expiry, permission loss, network failure, or a failed document save after sign-in.

Expected:

- Expired or invalid session should preserve the visible workspace locally, clear stale online session state, and ask the user to sign in again.
- Permission loss should not clear the workspace or falsely claim `Saved online`.
- Network/server failures should keep the workspace visible and leave Save online retryable.
- Failed online save should keep the workspace visible.
- The app should preserve the dirty/local state.
- The toolbar should expose a retry path without claiming `Saved online`.

### 2. Minor Polish: Display Name Normalization

The saved document row uses the file-safe name `Prod-Retest-Workspace-20260621-0654.canaster.json`, and after reload the workspace input displays `Prod-Retest-Workspace-20260621-0654`. That is consistent with the current storage naming path, but product UX may eventually want a separate human display title so spaces are preserved while the stored file name remains safe.

## Next Release Gate

Before the next public release, run this focused gate again:

1. Open `https://canaster.in` in a fresh browser profile.
2. Start signed out.
3. Request and verify email OTP for a normal non-admin account.
4. Save a titled local workspace online.
5. Confirm document create/patch requests succeed.
6. Hard reload and confirm the same workspace restores.
7. Sign out and confirm title, canvas, and camera remain stable while status changes to local.
8. Repeat Account and Documents checks at a narrow mobile viewport.
9. Force one account error, one expired-token case, one permission-denied case, and one save failure; confirm the workspace stays visible, local recovery remains available, and full readable recovery copy appears.
