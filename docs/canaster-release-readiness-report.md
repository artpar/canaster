# Canaster Release Readiness Report

Date: 2026-06-21

This report covers a fresh real-user production gate against:

- Frontend: `https://canaster.in`
- Backend/API: `https://api.canaster.in`
- Browser mode: isolated fresh Chrome context through DevTools
- Test account: `prod-gate-20260621t045818z@canaster.in`
- Test workspace: `Prod Gate Workspace 20260621 0458`
- Saved document row: `019ee88c-bcbb-772a-abec-304dd46a77a1`

## Verdict

Core production release path passes.

A fresh user can request email OTP from the deployed frontend, verify the code, save a local workspace online, reopen it from Documents, reload the page, restore the same online workspace, and sign out without losing the visible workspace. The deployed frontend now uses the narrow Daptin document model path, not full `/api/world` loading.

Backend storage and mail/auth blockers are closed. Production Daptin uses standard table defaults for mailbox rows, authenticated-user document access through the built-in `users` group, and private saved workspace rows by default.

Remaining release risk is now deploy validation. The production gate found frontend polish dents on narrow screens and a sign-out camera jump; those fixes exist locally and passed local browser verification against the production backend, but they are not production evidence until committed, pushed, deployed, and re-tested on `https://canaster.in`.

## Journey Results

| Journey | Status | Evidence |
| --- | --- | --- |
| Start working without an account | Pass on production | Fresh context opened the starter workspace, showed `Saved on this device`, had no permanent login bar, and kept the bottom-left map visible. |
| Email OTP sign-in | Pass on production | Deployed UI sent OTP with `POST /action/user_account/request_canaster_email_otp [200]`, then verified it with `POST /action/user_account/verify_canaster_email_otp [200]` and reached `Ready to save online`. |
| Save online from a local draft | Pass on production | `POST /api/document [201]`, then `PATCH /api/document/<id> [200]` twice, ending at `Saved online`. |
| Open a saved workspace | Pass on production | Documents drawer showed `1 saved`; selecting `Prod-Gate-Workspace-20260621-0458` kept the toolbar title and saved state aligned. |
| Return later on same device | Pass on production | Hard reload restored the signed-in session, active document id, workspace title, canvas, and `Saved online` state. Reload network calls were `GET /jsmodel/document.js [200]`, `GET /api/document/<id> [200]`, and `GET /api/document?page[size]=100&sort=-updated_at [200]`. |
| Sign out | Pass with UX dent | Sign out returned Account to `Sign in`, status to `Saved on this device`, and kept the visible workspace. The zoom readout jumped from `50%` before sign-out to `114%` after sign-out, so camera continuity needs polish. |
| Work on a small screen | Partial | At `390x844`, core controls remain reachable and the account error wraps. The compact toolbar hides the save status, and the bottom-left map is too wide/heavy for the viewport. |
| Recover from account or save errors | Partial | A wrong OTP produced readable text: `Could not verify that code. Check the code and try again.` The server returned `500` for the bad-code action, which the frontend translated into user-safe copy. Failed online save recovery was not re-tested in this pass. |

## Production Network Evidence

Valid sign-in and save flow:

- `POST https://api.canaster.in/action/user_account/request_canaster_email_otp` -> `200`
- `POST https://api.canaster.in/action/user_account/verify_canaster_email_otp` -> `200`
- `GET https://api.canaster.in/jsmodel/document.js` -> `200`
- `GET https://api.canaster.in/api/document?page[size]=100&sort=-updated_at` -> `200`
- `POST https://api.canaster.in/api/document` -> `201`
- `PATCH https://api.canaster.in/api/document/019ee88c-bcbb-772a-abec-304dd46a77a1` -> `200`
- `PATCH https://api.canaster.in/api/document/019ee88c-bcbb-772a-abec-304dd46a77a1` -> `200`
- `GET https://api.canaster.in/api/document/019ee88c-bcbb-772a-abec-304dd46a77a1` after reload -> `200`

Console during valid flow:

- No warnings or errors.

Intentional wrong-code check:

- `POST https://api.canaster.in/action/user_account/verify_canaster_email_otp` -> `500`
- Frontend showed readable product copy instead of backend details.

## Production Data Evidence

Saved document:

- `document_name`: `Prod-Gate-Workspace-20260621-0458.canaster.json`
- `reference_id`: `019ee88c-bcbb-772a-abec-304dd46a77a1`
- `permission`: `16256`
- `user_account_id`: `019ee88b-704d-7b2f-abff-edee97f918b2`

Email OTP and mailbox provisioning:

- Fresh OTP request created an outbox asset for `prod-gate-20260621t045818z@canaster.in`.
- OTP verification created the account and reached `Ready to save online`.
- Mailbox defaults were separately verified in production on 2026-06-21:
  - new `user_account.permission`: `569633`
  - new `mail_account.permission`: `569633`
  - six default `mail_box` rows, all `569633`
  - outbox processing delivered a `mail` row into the user's `INBOX`
  - signed-in user token could list `mail_account:1`, `mail_box:6`, `mail:1`
  - guest users saw no mailbox rows and received `403` for `/api/mail`

## Backend Access State

Document storage uses the Daptin-standard access shape:

- `world.permission(document)=561408`
- `world.usergroup_id -> users` relation permission: `770048`
- `world_schema_json.DefaultPermission(document)=16256`

This lets authenticated users in the built-in `users` group create/update documents while keeping anonymous clients out and keeping new document rows private to the owner. Do not replace this with guest create/update bits, and do not manipulate generated join tables directly.

Mailbox provisioning uses table defaults:

- `mail_account.DefaultPermission=569633`
- `mail_box.DefaultPermission=569633`
- generated world/usergroup relation metadata is preserved through Daptin `v0.12.22`

The auth action must continue using normal entity foreign-key fields and supported Daptin actions. It must not write generated join-table entities directly.

## Fixed Production Blockers

- Deployed frontend no longer requires normal users to load full `/api/world`.
- Account error text wraps instead of clipping.
- Daptin document create/update is available to authenticated users through the `users` group relation, not guest access.
- Email OTP request/verify works from production frontend.
- Daptin SMTP/outbox/mail storage works through Daptin-managed mail rows and GCS-backed assets.
- `daptin/daptin#225` is closed upstream in `v0.12.22`.
- `daptin/daptin#226` is closed as no longer needed after moving row permission policy to table defaults.

## Remaining Work

### 1. Deploy And Re-Test Local UI Fixes

Local candidate fixes made after the production gate:

- Sign-out preserves the current canvas camera while clearing account state.
- Compact toolbar keeps save state visible through a short sync label such as `Local`, `Saved`, `Ready`, or `Error`.
- True `390x844` mobile emulation collapses Save online to an icon button and keeps the status chip visible.
- The bottom-left map is visually scaled down on narrow screens.

Local verification against the production backend:

- `npm run build` passed.
- Local `http://127.0.0.1:5173/` email OTP request/verify passed.
- Local save created document `019ee898-d4ab-7ea7-8d2e-db01a3c25353`.
- Local sign-out kept zoom stable at `11%` before and after sign-out.
- True mobile emulation exposed the sync status as `Local` and kept Account/toolbar controls reachable.
- Local valid-flow console had no warnings or errors.

These fixes still need a production deploy and the release gate below repeated on `https://canaster.in`.

### 2. Production-Find: Sign-Out Camera Continuity

Observed in production:

- Before sign-out: zoom readout was `50%`.
- After sign-out: zoom readout became `114%`.
- Workspace stayed visible and local status was correct.

Expected:

- Sign out should clear account state and active online document identity without refitting or changing the current camera unless the user explicitly asks.

Local candidate status:

- Fixed locally; pending deploy/re-test.

### 3. Production-Find: Narrow-Screen Toolbar Status

Observed at `390x844`:

- Core commands remain reachable.
- Save status is hidden from the compact toolbar.
- Account popover error text wraps correctly.

Expected:

- The current save state should remain visible or discoverable in the compact toolbar.

Local candidate status:

- Fixed locally; pending deploy/re-test.

### 4. Production-Find: Mobile Map Size

Observed at `390x844`:

- Bottom-left map remains visible and usable.
- It is visually too wide/heavy for the viewport and competes with the canvas.

Expected:

- The map should remain useful but compact on narrow screens.

Local candidate status:

- Improved locally; pending deploy/re-test.

### 5. Re-Test Failed Save Recovery

This pass verified wrong-code recovery and local workspace retention through sign-out. It did not force a failed document save after sign-in.

Expected:

- Failed online save should keep the workspace visible, preserve the dirty/local state, and expose a retry path without claiming `Saved online`.

## Next Release Gate

After the remaining UI dents are fixed, run this exact gate again:

1. Open `https://canaster.in` in a fresh browser profile.
2. Start signed out.
3. Request and verify email OTP for a normal non-admin account.
4. Save a titled local workspace online.
5. Confirm document create/patch requests succeed.
6. Open Documents and select the saved workspace.
7. Hard reload and confirm the same workspace restores.
8. Sign out and confirm title, canvas, and camera remain stable while status changes to local.
9. Repeat the Account and Documents checks at a narrow mobile viewport.
10. Force one account error and one save error and confirm full readable recovery copy.
