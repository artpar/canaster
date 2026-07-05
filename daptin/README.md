# Canaster Daptin Backend

This directory is the backend contract for Canaster. Daptin is the backend; Canaster does not own a custom API server.

## Daptin Responsibilities

- Auth, users, groups, row ownership, and permission bitmasks.
- CRUD APIs for built-in `document` content and metadata.
- Schema-managed actions for `document` and `asset` permission changes.
- Static hosting through Daptin `site` and `cloud_store` for production frontend delivery.
- Cloud-store-backed raw SMTP/IMAP message storage through `mail.mail` and `outbox.mail`.
- JSON file blob persistence through `document.document_content`.

## Schema

MVP uses Daptin's built-in `document` table for workspace storage:

- `document_content`: one `application/json` file containing the full nested canvas snapshot, view state, and undo/redo history.

The older `space` / `plane` / `snapshot` schema is stale and must not be used for MVP backend integration. Do not add `canaster_document` for MVP. See `docs/daptin/daptin-canaster-architecture-plan.md` for the concrete built-in `document` file-blob plan.

Canaster ships an actions-only schema file for email OTP auth:

- `request_canaster_email_otp` on `user_account` accepts `email`, creates the user account if missing, makes that new account row self-owned with owner `Refer` permission for Daptin's OTP-profile foreign key, switches the action context to that user, generates a Daptin OTP, and sends it through Daptin's `mail.send` SMTP performer.
- `verify_canaster_email_otp` on `user_account` accepts `email` and `otp`, runs `otp.login.verify`, returns Daptin's `client.store.set` token response, and then provisions the user's Daptin mailbox if it is missing.
- `set_canaster_mail_username` on `user_account` lets a signed-in user choose or change their Canaster mail username when the local part is available and at least five characters of `a-z`, `0-9`, `.`, `_`, or `-`.
- Both action rows use `Permission: 32` (`GuestExecute`) so the public auth surface is action execution only. This does not grant anonymous CRUD on `document` or `user_account`.
- Built-in password `signin` and `reset-password-verify` must stay guest-executable for users who log in with email and password or complete a forgotten-password reset. Canaster sends reset codes through `request_canaster_password_reset` so the sender and SMTP server stay explicit (`login@canaster.in` through `mail.canaster.in`). Production deploys enforce `action.permission` of `2085152` for `signin`, `reset-password`, and `reset-password-verify` after Daptin starts for compatibility with existing rows, but the frontend should not call built-in `reset-password`. Do not relock them to `2085120`; keep `signup` locked.

Canaster ships a routed-template action for shared document pages:

- `get_canaster_document_by_public_path` on `document` accepts `username` and `slug`.
- The action returns `Reference: document`, matching Daptin routed-template data shape used by 100x templates.
- The public route is `/d/:username/:slug`.
- The action queries `document_name == username + "/" + slug + ".canaster.json"` and `document_extension == "json"`.
- Today, `username` means Canaster's public account slug stored in `user_account.name`. New OTP-created accounts set it to a sanitized email local part plus six random digits, for example `artpar-123456`. The frontend reads the JWT `name` claim and uses that same value when saving `document_name` and copying share links. A future editable username system needs an explicit account-profile contract; do not infer one from this route alone.
- The action row uses `Permission: 2085152`, which preserves the normal owner/group action shape and adds `GuestExecute`. Bare `32` (`GuestExecute` only) is not enough for this routed-template action path.
- The `document` table permission must include `GuestExecute` (`1003811`) so Daptin can execute document actions from a guest-routed template. This still does not grant anonymous document create/update/delete.
- Verify the imported action row through `daptin-cli`; the `get_canaster_document_by_public_path` action must keep `permission=2085152` after first-admin bootstrap so routed-template guests can execute it without opening document CRUD. This is separate from `AccessGroups`, which provisions usergroup relations but does not grant guest execution. Daptin `v0.12.28` preserves explicit schema action permissions during `become_an_administrator`.
- Anonymous access still depends on normal Daptin row permissions. Private rows are not exposed by this action; the SPA then shows the sign-in flow after hydration.

Canaster also ships explicit owner-only visibility actions:

- `set_canaster_document_private` and `set_canaster_document_public` run on a specific `document` instance.
- `set_canaster_asset_private` and `set_canaster_asset_public` run on a specific `asset` instance.
- Each action checks `subject.user_account_id == user.reference_id` before patching `permission`; non-owners receive a `client.notify` error response.
- The browser must call these actions through `daptin-client.actionManager.doAction(..., { referenceId })`. It must not change `permission` through generic JSON:API `PATCH` on `document` or `asset`.
- Public/private actions are fixed transitions: private is `16256`, public is `16259`. The browser does not supply arbitrary permission values.
- These four action rows use `Actions[].AccessGroups` to relate the specific action rows to the built-in `users` usergroup with `GroupExecute` (`524288`) so normal signed-in accounts can execute them without making the actions guest-executable. Do not use broad `TableName: action` `DefaultGroups` for this; it grants unrelated actions too widely.

The template row itself is not schema-seeded. Daptin registers `template.url_pattern` routes from database rows at startup, so an operator must create or update the row after the site reference is known:

```bash
npm run daptin:provision-share-template -- --site-ref <site_reference_id> --config <daptin_cli_config>
```

That command creates or updates a `template` row equivalent to:

- `name`: `CanasterDocument`
- `content`: `subsite://<site_reference_id>/index_with_og.html`
- `url_pattern`: `["/d/:username/:slug"]`
- `action_config`: `{"action":"get_canaster_document_by_public_path","type":"document"}`
- `mime_type`: `text/html`
- `permission`: table default. Do not force a restrictive row permission during create; local Daptin testing showed that can trip `TableAccessPermissionChecker`.

Create the template row before starting the production Daptin process when possible. If the row is created or changed after Daptin is already running, restart Daptin so `CreateTemplateHooks` registers `/d/:username/:slug`.

Mailbox provisioning is attached to the first successful OTP verification, not OTP request. That first verification creates one `mail_account` row with a valid fallback `@canaster.in` username and creates the default `mail_box` rows (`INBOX`, `Draft`, `Sent`, `Archive`, `Trash`, `Spam`) through normal entity foreign-key columns. A signed-in user can later choose or change the local part through `set_canaster_mail_username`; the action rejects unavailable names and names shorter than five valid characters. The login email is only for authentication and must not become the send/receive identity unless the user explicitly chooses that local part. The flow does not write generated join tables. The `mail`, `mail_account`, and `mail_box` row defaults are `DefaultPermission: 12672` (`Owner: Peek, Read, Execute, Refer`; no Guest or Group row access). Authenticated users get table/action reachability through `AccessGroups`, but row reads must stay owner-scoped. The mailbox password is generated server-side, stays under Daptin's bcrypt input limit, and is not returned to the browser; expose an authenticated mailbox-password reset action later if direct IMAP/SMTP client login is needed.

Inbound SMTP stores messages as the recipient user, so production must grant the built-in `users` usergroup table-level create on the `mail` world row. The intended state is `world.permission(mail)=561408` and a `usergroup(users).world_id -> mail` relation permission of `638976` (`Group: Peek, Read, Create, Execute`). The generated `world_world_id_has_usergroup_usergroup_id` relation table default is `DefaultPermission: 638976`; existing relation rows that predate the default must be repaired to the same permission. Do not grant `GuestCreate` on `mail`.

File-backed panels use `daptin/schema_canaster_assets.yaml`, which adds an `asset` table with short fields: `name`, `mime`, and cloud-store-backed blob `file`. Production must create a Daptin `cloud_store` row named `assets` backed by GCS before file upload is enabled. The `asset` table should follow the document table's authenticated-user access shape except delete: owner/private row default (`DefaultPermission: 16256`) and a `users` usergroup relation that grants Peek, Read, Create, Update, and Execute. The Read bit is needed on the `asset` world relation so normal users can discover the asset model from `/api/world`; it is not row-level sharing, because asset rows still use owner/private default permissions. Do not store file bytes in workspace JSON; file-backed nodes keep only `assetId` plus display metadata. Asset permission changes use the schema-managed asset visibility actions, not generic JSON:API `PATCH`.

Production email delivery uses Daptin SMTP, not AWS SES. The OTP action sends from `login@canaster.in` with `mail_server_hostname: mail.canaster.in`. Production must have:

- a Daptin `mail_server` row for `mail.canaster.in`;
- a Daptin `certificate` row for `canaster.in` with a private key so outgoing OTP mail signs as `d=canaster.in`;
- a Daptin `certificate` row for `mail.canaster.in` with a private key for the SMTP server identity;
- a Daptin `cloud_store` row named `canaster-mail` backed by GCS for raw `mail.mail` and `outbox.mail` message bodies;
- DNS for `canaster.in`, `mail.canaster.in`, and DKIM selector `d1._domainkey.canaster.in` using the apex certificate public key; and
- Daptin's scheduled `outbox.process` action running so queued `mail.send` messages are retried. The OTP action sets `send_immediately: true`, so Daptin attempts delivery for the newly created cloud-store-backed outbox row before returning.

The production `document` table creates new rows with `world_schema_json.DefaultPermission=16256`. Keep the MVP create flow conservative: create a harmless placeholder row under that private default, then PATCH the real JSON file content. Do not use generic JSON:API `PATCH` for `permission`; use the schema-managed visibility actions for public/private transitions.

Production after admin lockdown must grant `document` table access to authenticated users through schema `AccessGroups`, not through guest create/update/delete bits or row-level default groups. The current intended setting is `world.permission(document)=1003811`, with `Tables[].AccessGroups` provisioning the `document` world row relation to `users` with `permission=999424` (`Group: Peek, Create, Update, Delete, Execute`, no Group Read). Anonymous `POST`, `PATCH`, and `DELETE` on `document` return `403`; anonymous `GET` only works for rows explicitly made public-readable by the document visibility action, and anonymous `Execute` is present so Daptin routed-template actions can run when their action row also grants `GuestExecute`. The normal signed-in browser save path creates, updates, and deletes owned document rows successfully. Verify the browser journey with a normal non-admin account before release; a privileged CLI smoke does not prove the user path.

## Local Daptin Startup

Daptin loads `schema_*.yaml` files from its schema folder at startup. For permanent local Canaster development, use Docker Compose:

```bash
npm run daptin:up
npm run daptin:logs
npm run daptin:down
```

Local Daptin uses Postgres, not SQLite, to stay close to production. The Compose project uses named `postgres-data` and `daptin-data` volumes, so it is a persistent local backend. Normal `daptin:down` stops it without deleting accounts, saved documents, assets, mail rows, or stored files. Only remove volumes when intentionally resetting local state.

Before Compose starts Daptin, `npm run daptin:up` runs `scripts/prepare-local-daptin-schema.sh`. That script copies production `daptin/schema_*.yaml` files into `.tmp/daptin/local-schema` and substitutes only the local mail identity:

- `login@canaster.in` becomes `login@canaster.local`.
- `mail.canaster.in` becomes `canaster.local` by default so Daptin's SMTP
  `AllowedHosts` accepts local `user.name@canaster.local` mailboxes.

Why this exists: the checked-in `daptin/` schema directory is production backend material and must keep the production sender and SMTP host. Local mail identity belongs in generated `.tmp` schema, not in production schema files.

The local hostnames are:

- app: `http://canaster.local:5173`
- Daptin HTTP/API: `http://canaster.local:6336`
- Daptin HTTPS: `https://canaster.local:6443` after local HTTPS is configured in Daptin
- SMTP: `canaster.local` on port `25` for local self-delivery
- IMAPS: `imap.canaster.local` on port `993`

For local mail testing, `canaster.local`, `mail.canaster.local`, and `imap.canaster.local` must resolve to `127.0.0.1`. The Compose DNS sidecar also publishes an MX record for `canaster.local` pointing at `canaster.local`, because Daptin's outbox processor performs MX lookup before SMTP delivery.

Run the frontend against the persistent local backend with:

```bash
npm run dev:local
```

Use `daptin-cli` to provision local backend rows such as admin users, `mail_server`, `certificate`, `cloud_store`, `site`, and `template`. Do not bypass `daptin-cli` with direct SQL, `curl`, inline Node HTTP probes, or custom backend scripts. The app UI remains the preferred path for account, save, open, document visibility, asset, and live flows.

There is currently no supported repo-level Daptin smoke script. Older smoke scripts mixed `daptin-client` and direct HTTP probes with setup work; that violates the current backend-operation boundary and has been removed from the runnable local workflow.

For rapid local Canaster development, keep Daptin running through Compose when needed and use the app UI for account, save, open, document visibility, asset, and live flows. For non-UI backend maintenance, use `daptin-cli` only. `scripts/provision-canaster-share-template.sh` is the current script pattern because it intentionally uses `daptin-cli` without direct HTTP or SQL calls.

Current frontend/static verification is:

```bash
npm run verify:fast
npm run verify:static
```

These checks do not prove Daptin integration, live transport, asset upload/download, or production auth behavior. Treat those as manual UI verification or future `daptin-cli`-backed automation work.

## SDK Boundary

Frontend code must use `daptin-client` and Daptin managers:

- `actionManager` for email OTP request/verify actions and `authManager.extractToken` for the returned Daptin token.
- `worldManager` to load the required `document` model before JSON:API calls.
- `jsonApi` for built-in `document` CRUD.
- file-array encode/decode helpers for `document_content`.

With `daptin-client@0.7.12`, send `document_content` as `JSON.stringify(fileArray)` through `jsonApi.create` and `jsonApi.update`. Decode reads by parsing the returned string.

Do not implement private sharing or collaboration in MVP.

## Production Deploy Shape

Production Daptin runs directly on a Compute Engine VM and owns API, static frontend hosting, TLS, and SMTP. Do not add a reverse proxy layer for Canaster.

1. Run one Daptin container on `canaster-daptin-vm` with Cloud SQL for PostgreSQL.
2. Publish VM ports `80 -> Daptin HTTP`, `443 -> Daptin HTTPS`, and SMTP ports `25`, `465`, `587`.
3. Start with the Canaster actions-only auth schema folder for email OTP; use Daptin's built-in `document` for app state.
4. Create an admin user and verify required schema rows through `daptin-cli`.
5. Verify the schema-managed OTP actions are present and executable by guest requests.
6. Configure Daptin `mail_server`, `certificate`, DKIM DNS, and outbox processing for OTP delivery.
7. Create/link a GCS-backed Daptin `cloud_store` for static site files.
8. Create a GCS-backed Daptin `cloud_store` named `canaster-mail` for raw mail/outbox message bodies.
9. Create a GCS-backed Daptin `cloud_store` named `assets` for file-backed panel uploads.
10. Create one Daptin `site` row per frontend hostname. The current public frontend rows are `canaster.in` and `www.canaster.in`.
11. Keep `api.canaster.in` as the Daptin admin/API hostname and do not create a static site row for it.
12. CI builds the Daptin image, builds `dist/`, uploads it to the site storage prefix, deploys the image to the VM over IAP SSH, and probes the VM runtime.

Current public TLS shape:

- Daptin has ACME certificate rows for `api.canaster.in`, `canaster.in`, and `www.canaster.in`.
- Daptin HTTPS is enabled through `/_config/backend/enable_https=true` and backend `hostname=api.canaster.in`.
- As of 2026-06-18, the VM at `34.14.185.249` serves the Canway frontend on HTTP and Daptin API on HTTP/HTTPS when the correct Host/SNI is used. Public DNS cutover from the old load balancer is still required.
- Public frontend auth calls should use `https://api.canaster.in`; after this schema is deployed, browser auth uses the schema-managed email OTP actions `request_canaster_email_otp` and `verify_canaster_email_otp`.
- Production document storage has `world.permission(document)=1003811`, `Tables[].AccessGroups(document -> users)` relation permission `999424`, and `DefaultPermission(document)=16256`. Production asset storage has `world.permission(asset)=741632`, `Tables[].AccessGroups(asset -> users)` relation permission `770048`, and `DefaultPermission(asset)=16256`. These world-usergroup relations grant signed-in users table-level create/update where needed while private rows remain visible only to their owner. Do not add `DefaultGroups` on `document` or `asset`, because those become row-level group relations and leak private rows. The extra document `GuestExecute` bit is required for Daptin routed-template actions and does not grant anonymous create/update/delete. The asset world relation includes `GroupRead` only so `daptin-client` can load the asset resource definition for normal users. The four visibility action rows use `Actions[].AccessGroups(action -> users)` with permission `524288`. Do not use direct SQL, raw HTTP, or anonymous guest create/update/delete bits for the save path.

See `docs/daptin/daptin-backend-groundwork.md` for the exact GCP commands and required CI/CD variables.

See `docs/daptin/daptin-template-rendering-gotchas.md` for routed-template behavior, 100x reference patterns, slug mapping, and Daptin CLI pitfalls found while implementing Canaster share metadata.

## Required CI/CD Configuration

GitHub variables and secrets are listed in `docs/daptin/daptin-backend-groundwork.md`. Google Secret Manager must contain `canaster-daptin-vm-db-connection` for the VM runtime.
