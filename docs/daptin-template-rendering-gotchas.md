# Daptin Template Rendering Gotchas

This note captures the local findings from wiring Canaster document share URLs to Daptin routed templates, using 100x as the working reference implementation.

## Working Model

Daptin routed templates are not just static files. They need three pieces to line up:

1. A Daptin `template` table row with `url_pattern`, `content`, `mime_type`, `action_config`, `cache_config`, and `headers`.
2. A schema action named by `action_config`, usually with an `OutFields` `GET` that sets a `Reference`.
3. A site-hosted HTML file referenced by `content`, usually `subsite://<site_reference_id>/index_with_og.html`.

The 100x production rows use this shape:

```json
{
  "type": "template",
  "content": "subsite://<site-ref>/index_with_og.html",
  "mime_type": "text/html",
  "url_pattern": "[\"/document/:userId/:slug\"]",
  "action_config": "{\"action\":\"get_document_page_by_slug\",\"type\":\"document\"}",
  "cache_config": "{}",
  "headers": "{}",
  "permission": 561441
}
```

The matching 100x schema action returns `Reference: document`, so the HTML template can read `.document`.

## Route Lifecycle

Daptin registers template routes at server startup.

Where: `server/subsite/template_handler.go`, `CreateTemplateHooks`.

Why it matters:

- Creating or updating a `template` row after Daptin has started does not necessarily register a new route immediately.
- Prefer creating the template row before starting Daptin.
- If the row changes after startup, restart Daptin so `CreateTemplateHooks` can bind the `url_pattern`.

## Template Data Shape

Daptin builds a template input map from route params, query params, and action responses.

Important behavior from `template_handler.go`:

- Route params become top-level keys. Example: `/d/:username/:slug` gives `.username` and `.slug`.
- Query params also become top-level keys.
- If `action_config` is present, Daptin executes the action and merges each action response by `ResponseType`.
- For a schema `OutFields` entry with `Reference: document`, the template receives `.document`.

For Canaster, this means:

```yaml
OutFields:
  - Type: document
    Method: GET
    Reference: document
```

Then the HTML can use:

```html
<!-- {{if .document}} -->
  <meta property="og:title" content="{{if .slug}}{{ .slug }}{{else}}{{ (index .document 0).document_name }}{{end}}" />
<!-- {{end}} -->
```

## HTML Template Pattern

100x keeps Go-template directives inside HTML comments:

```html
<!-- {{if .article}} -->
  <title>{{ (index .article 0).title }}</title>
<!-- {{end}} -->
```

Why:

- Browsers ignore the directives if the file is opened as plain HTML.
- Daptin still evaluates the Go template before serving.
- This keeps a single HTML file usable as a Vite entry and as a Daptin-rendered template.

For Vite, 100x uses two HTML inputs:

```ts
rollupOptions: {
  input: {
    main: path.resolve(__dirname, 'index.html'),
    index_with_og: path.resolve(__dirname, 'index_with_og.html')
  }
}
```

Canaster follows that same shape. Do not create `public/index_with_og.html` for this use case, because Vite copies `public` files as-is and will not rewrite `/src/ui/main.tsx` into production bundle assets.

## Slug Mapping

The readable URL should include a slug, but Canaster should not add a new table or move the public document API for this.

Current Canaster mapping:

- URL: `/d/:username/:slug`
- `username`: public account slug stored in `user_account.name`. New OTP-created accounts set this to a sanitized email local part plus six random digits, for example `artpar-123456`.
- `slug`: derived from the document title.
- Daptin lookup key: `document_name == username + "/" + slug + ".canaster.json"`
- `document_path`: remains `/canaster/documents/<reference_id>.canaster.json`

This is a route namespace, not a complete editable username product. Daptin's built-in `user_account` has unique `email` and indexed `name`, but no existing Canaster-managed unique username column. If Canaster later needs claimed handles, redirects on handle changes, or stronger collision guarantees, add that as an explicit account-profile contract before changing this route behavior.

Why not a separate slug table:

- Existing persistence already uses built-in `document`.
- `document_name` already persists a path-like owner/title key, following the 100x pattern of routing public document pages through `document_name`.
- A new table would add permissions, migrations, and route ownership without solving a current uniqueness problem.

Why not slug-only:

- A document title slug is not globally unique.
- Titles can change.
- The owner segment scopes the slug without exposing Daptin's internal document route shape.

The action query enforces the path mapping:

```yaml
query: '!JSON.stringify([{"column": "document_name", "operator": "is", "value": username + "/" + slug + ".canaster.json"}, {"column": "document_extension", "operator": "is", "value": "json"}])'
```

There is no production `/d/:documentId` fallback. The public production route is `/d/:username/:slug`.

## Private Documents

Daptin routed templates always write a rendered response with HTTP 200 when the route handler runs. Do not rely on this mechanism for true 404/403 page behavior.

For Canaster:

- Private rows should not be exposed by anonymous `GET`.
- If the routed action returns no `.document`, the HTML renders generic `noindex,nofollow` metadata.
- After hydration, the Canaster SPA sees the shared username/slug in the path and shows the sign-in flow for anonymous users.

This matches the current product goal: private/inaccessible shared links render the app/sign-in page, not a Daptin error page.

## Share Metadata

The routed action can derive share metadata from the existing `document.document_content` JSON. Do not add document metadata columns unless the JSON-backed action path proves insufficient.

Why:

- Canaster already stores the full `CanvasWorkspaceSnapshot` in `document_content`.
- The snapshot already contains the root canvas title, root panels, and `history.present.appearance.previewImage`.
- Daptin action attributes support `!` JavaScript expressions through Goja, including `JSON.parse`, `atob`, array operations, and defensive IIFEs.

Current shape:

- `get_canaster_document_by_public_path` still returns the real `.document` row.
- The same action also returns `.share_meta` through an `ACTIONRESPONSE`.
- `index_with_og.html` reads `.share_meta.title`, `.share_meta.description`, `.share_meta.author`, `.share_meta.updated_at`, `.share_meta.image_asset_id`, and `.share_meta.tags`.
- The OG image URL is built as `%VITE_DAPTIN_ENDPOINT%/asset/asset/<image_asset_id>/file`.
- If the snapshot lacks a preview asset id, the template falls back to `%VITE_CANASTER_OG_IMAGE_URL%`.
- Repeated `article:tag` tags and JSON-LD `keywords` come from root panel titles. The classic `<meta name="keywords">` tag is intentionally not emitted.
- JSON-LD uses `CreativeWork` because a Canaster workspace is a practical saved document, not a blog post or marketing page.

Important Daptin source behavior:

- `server/subsite/template_handler.go` merges every action response into the render input using `ResponseType` as the key.
- `server/resource/handle_action.go` creates an `ACTIONRESPONSE` with `ResponseType == model.GetName()`.
- Therefore `Type: share_meta` + `Method: ACTIONRESPONSE` becomes `.share_meta` in the Go template.

What not to do:

- Do not duplicate title, description, date, or image fields into the document row while they can be derived from the stored snapshot.
- Do not change asset permissions as part of metadata rendering. Public/private/share/group behavior belongs to the product sharing interface.

2026-07-01 local verification:

- Fresh disposable Daptin `v0.12.26` on `http://localhost:7336`.
- Route: `http://localhost:7336/d/share-e2e-admin-483921/Metadata-E2E`.
- Test document: `019f1c81-5720-7049-bcfa-927765fe614b`.
- The saved `document_content` snapshot had root canvas title `Local OG Metadata Workspace`, root panel `Quarterly launch plan`, note text `Share text should come from the saved document JSON.`, and `appearance.previewImage.assetId == 019f1c7e-0000-7000-8000-000000000001`.
- Browser-rendered title: `Local OG Metadata Workspace | Canaster Local E2E`.
- Browser-rendered description and `og:description`: `Local OG Metadata Workspace: Quarterly launch plan: Owner checklist, rollout risk, and follow-up timeline - Share text should come from the saved document JSON.`
- Browser-rendered `og:image` and `twitter:image`: `http://localhost:7336/asset/asset/019f1c7e-0000-7000-8000-000000000001/file`.
- Browser-rendered image dimensions: `1200` x `630`.
- Browser-rendered dates normalized to ISO-8601, for example `2026-07-01T07:07:46.336Z`.
- Browser-rendered author fields: `share-e2e-admin-483921`.

2026-07-01 tag and JSON-LD verification:

- Fresh disposable Daptin `v0.12.26` on `http://localhost:7336`.
- Route: `http://localhost:7336/d/share-e2e-admin-483921/Metadata-E2E`.
- Test document: `019f1c96-0ca9-7958-a7f7-c109cc4728ad`.
- Browser-rendered `article:tag` values: `Quarterly launch plan`, `Share text should come from the saved document JSON.`, `Launch readiness checklist`.
- Browser `JSON.parse` of `script[type="application/ld+json"]` succeeded.
- Parsed JSON-LD used `@type: CreativeWork`, `name: Local OG Metadata Workspace`, canonical route URL, preview asset image URL, ISO dates, author, and `keywords` matching the rendered tags.

Local CLI gotcha:

- `daptin-cli execute document get_canaster_document_by_public_path ...` failed with `json: cannot unmarshal array into Go struct field DaptinActionResponse.Attributes of type map[string]interface {}` because the existing `.document` response has array attributes.
- This is a CLI rendering limitation. The routed template path still works because `server/subsite/template_handler.go` consumes the internal action response slice directly.
- Verify this route with Chrome/template rendering or improve `daptin-cli` to support array-valued action response attributes.

## Daptin CLI Gotchas

Use `daptin-cli` for backend operations. Do not bypass it with direct SQL, `curl`, browser `fetch`, inline Node HTTP probes, or custom one-off scripts.

Context safety:

- The global `canaster-local` context may point at production-like state.
- Prefer `--config <temp-config>` or `--endpoint <local-url>` on every command.
- Canaster's provisioning script refuses the default context unless `--config`, `--endpoint`, or `--allow-default-context` is supplied.
- Do not export a relative `DAPTIN_CLI_CONFIG` inside scripts when also passing `--config`. In local testing, `DAPTIN_CLI_CONFIG=.tmp/daptin/share-e2e-cli.yaml daptin-cli --config .tmp/daptin/share-e2e-cli.yaml ...` lost the authenticated table view for `template` and caused `No rows found` / `403 TableAccessPermissionChecker`. Passing `--config` as an explicit CLI argument without exporting the env var worked.

Global flags:

- `--no-truncate` is a global flag. Put it before the command:

```bash
daptin-cli --endpoint http://localhost:6336 --no-truncate list site
```

Do not put it after `list`; subcommands reject it there.

Action table filtering:

- Filtering `action` by `name` can fail with `table [action] invalid column query [name]`.
- Use `action_name` for action rows:

```bash
daptin-cli --output json list action --filter action_name=get_canaster_document_by_public_path
```

`--quiet list` no-row output:

- `daptin-cli --quiet list template ...` can print `No rows found`.
- Do not treat the first line as a reference id unless it is UUID-shaped.
- The provisioning script now validates `^[0-9a-fA-F-]{36}$` before choosing update.

Template table permissions:

- Anonymous `create template` returns `403 TableAccessPermissionChecker`.
- This is correct. Template rows require an admin-capable CLI context.
- Fresh Daptin `v0.12.26` admin bootstrap can create template rows after table defaults are opened for the local e2e. The tested sequence was:

```bash
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml table defaults ensure template --permission 2097151 --group administrators:2097151
docker compose -f .tmp/daptin/share-e2e.compose.yml restart daptin
```

- For normal production, do not blindly copy that `2097151` default. The point was to unblock disposable local admin provisioning. Production should keep the intended template table policy and create/update rows through an admin context.
- Creating a `template` row with a JSON payload that includes `"permission": 561441` can trip `TableAccessPermissionChecker` during create. Creating without a `permission` attribute lets Daptin apply the table `DefaultPermission`.

`related` command:

- `daptin-cli related` does not accept list flags like `--page-size`.
- Some invalid relation names return an HTML response, leading to `parse response: invalid character '<' looking for beginning of value`.
- Treat that as a CLI/API relation-name failure, not as JSON data.

## Local E2E Notes

Existing local Daptin on `localhost:6336`:

- Already had locked-down auth/admin bootstrap.
- `signup` returned `403`.
- `world become_an_administrator` returned `403`.
- `template` creation returned `403`.
- After restarting local Daptin, logs confirmed `schema_canaster_share.yaml` was loaded and the routed-template action was added.

Fresh disposable Daptin:

- A new database is required if `world become_an_administrator` has already been consumed or locked in the existing local database.
- Use a separate compose project and port to avoid disturbing the normal local instance.
- `daptin/daptin:v0.12.22` failed admin bootstrap through `daptin-cli execute user_account signup ... passwordConfirm=...`; it parsed fields but Daptin failed validation around `name` / password confirmation.
- `daptin/daptin:v0.12.26` worked with the same bootstrap shape:

```bash
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml context add canaster-share-e2e http://localhost:7336
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml context set canaster-share-e2e
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml execute user_account signup email=share-e2e-admin@canaster.local name=CanasterShareE2E password=CanasterSmoke1234 passwordConfirm=CanasterSmoke1234
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml execute user_account signin email=share-e2e-admin@canaster.local password=CanasterSmoke1234
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml execute world become_an_administrator
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml execute user_account signin email=share-e2e-admin@canaster.local password=CanasterSmoke1234
```

Important: do not work around this with SQL or direct HTTP. If CLI cannot bootstrap the account, stop and fix/report the CLI path.

## Local E2E Runbook

This is the successful local route proof from 2026-06-30 for the production route shape `/d/:username/:slug`.

1. Start a disposable Daptin `v0.12.26` on `7336`, with a separate compose project/volumes and the repo `daptin/` schema folder mounted.

```bash
docker compose -f .tmp/daptin/share-e2e.compose.yml up -d
```

2. Wait for Daptin through `daptin-cli`, not `curl`:

```bash
daptin-cli --endpoint http://localhost:7336 list world --page-size 1
```

3. Bootstrap admin through `daptin-cli` as shown above.

4. Use the built-in local cloud store. Fresh `v0.12.26` had:

```text
cloud_store.name: localstore
cloud_store.reference_id: 019f19a6-f2e4-77b1-8903-d2ee413bed83
cloud_store.root_path: /data/storage
cloud_store.store_provider: local
```

5. Verify the schema-loaded permissions before provisioning the template:

```bash
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml --output json list action --filter action_name=get_canaster_document_by_public_path
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml --output json list world --filter table_name=document
```

Expected Canaster values:

```text
action.permission: 2085152
world.permission(document): 1003811
```

Historical local gotcha on Daptin `v0.12.26` and `v0.12.27`: fresh schema import initially created `get_canaster_document_by_public_path` with the schema-declared permission, but `become_an_administrator` then downgraded explicit action permissions to `2085120`. The disposable e2e was repaired with:

```bash
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml update action 019f19a6-f2ac-71f5-b810-5b433e617153 permission=2085152
```

Daptin `v0.12.28` preserves explicit schema action permissions during `become_an_administrator`, and Canaster smoke now checks the routed-template action remains `2085152` after bootstrap. Keep this verification after production schema deploy too. A route can exist and still render without `.document` if the action row is missing `GuestExecute`.

6. Upload the local share HTML fixture:

```bash
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml storage upload localstore:/canaster-share-e2e .tmp/daptin/share-site --recursive
```

The fixture used an absolute Vite dev-server script URL and the Vite React preamble because this repo forbids local `npm run build`:

```html
<script type="module">
  import RefreshRuntime from 'http://localhost:5173/@react-refresh';
  RefreshRuntime.injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
  window.__vite_plugin_react_preamble_installed__ = true;
</script>
<script type="module" src="http://localhost:5173/src/ui/main.tsx"></script>
```

Without that preamble, Chrome showed `@vitejs/plugin-react can't detect preamble` and the React root stayed empty.

7. Create the site row and set `cloud_store_id` directly:

```bash
SITE_REF="$(daptin-cli --config .tmp/daptin/share-e2e-cli.yaml --quiet create site name=canaster-share-e2e hostname=localhost path=canaster-share-e2e enable=true site_type=static | sed -n '1p')"
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml update site "$SITE_REF" cloud_store_id=019f19a6-f2e4-77b1-8903-d2ee413bed83
```

Verified site reference:

```text
019f19a8-5da5-7133-9bde-15776ead7d3e
```

`daptin-cli relate site "$SITE_REF" cloud_store_id "$STORE_REF"` returned `Related` but left `site.cloud_store_id` nil on this Daptin build.

8. Open local template-table permissions only for the disposable admin provisioning path:

```bash
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml table defaults ensure template --permission 2097151 --group administrators:2097151
docker compose -f .tmp/daptin/share-e2e.compose.yml restart daptin
```

9. Provision the template row:

```bash
scripts/provision-canaster-share-template.sh --site-ref "$SITE_REF" --config .tmp/daptin/share-e2e-cli.yaml
```

The script creates or updates:

```text
name: CanasterDocument
content: subsite://<siteRef>/index_with_og.html
url_pattern: ["/d/:username/:slug"]
action_config: {"action":"get_canaster_document_by_public_path","type":"document"}
```

Verified template reference:

```text
019f19a8-c44d-7ac0-8b3e-437250982e7f
```

10. Create a public document with the route-key document name:

```bash
DOC_REF="$(daptin-cli --config .tmp/daptin/share-e2e-cli.yaml --quiet create document '{"document_name":"share-e2e-admin-483921/E2E-Workspace.canaster.json","document_path":"/canaster/documents/e2e-workspace.canaster.json","document_extension":"json","mime_type":"application/json","document_content":"[{\"name\":\"share-e2e-admin-483921/E2E-Workspace.canaster.json\",\"file\":\"data:application/json;base64,eyJzY2hlbWFWZXJzaW9uIjoxfQ==\",\"type\":\"application/json\"}]"}' | sed -n '1p')"
daptin-cli --config .tmp/daptin/share-e2e-cli.yaml update document "$DOC_REF" permission=16259
```

Verified document reference:

```text
019f19a8-fe7f-7422-b8b9-e8cfc436e333
```

11. Restart Daptin so site and template routes register:

```bash
docker compose -f .tmp/daptin/share-e2e.compose.yml restart daptin
```

Expected logs:

```text
TemplateRoute [/d/:username/:slug] => CanasterDocument
```

12. Open in Chrome:

```text
http://localhost:7336/d/share-e2e-admin-483921/E2E-Workspace
```

Verified result:

- HTTP 200 for the route.
- Browser title: `E2E-Workspace | Canaster Local E2E`.
- `meta[name=description]`: `Open this Canaster workspace to inspect, update, and organize work visually.`
- `meta[name=robots]`: `index,follow`.
- Canonical URL: `http://localhost:7336/d/share-e2e-admin-483921/E2E-Workspace`.
- `og:type`: `website`.
- `og:site_name`: `Canaster`.
- `og:title`: `E2E-Workspace`.
- `og:description`: `Open this Canaster workspace to inspect, update, and organize work visually.`
- `og:url`: `http://localhost:7336/d/share-e2e-admin-483921/E2E-Workspace`.
- `og:image`: `http://localhost:7336/og-image.svg`.
- `twitter:card`: `summary_large_image`.
- `twitter:title`: `E2E-Workspace`.
- Canaster SPA hydrated from `localhost:5173`.
- UI showed `Sign in to open shared workspace` and opened the account sign-in dialog.
- The only browser console warnings were font URL load warnings from the local dev fixture resolving fonts through `localhost:7336`; they did not block server metadata or hydration.

## Permission Findings

Two permissions are required for the routed template action:

1. The action row must be executable by guests.
2. The target world row from `action_config.type` must allow GuestExecute.

For Canaster:

- `get_canaster_document_by_public_path` needs permission `2085152`, not bare `32`.
- `document` world permission needs GuestExecute added to the existing production shape: `1003779 + 32 = 1003811`.

Why:

- With action permission `32`, Daptin still logged that the routed-template action was not allowed.
- With action permission `2085152` but document world permission `1003779`, Daptin still logged the same denial.
- With action permission `2085152` and document world permission `1003811`, the route rendered successfully.
- On a fresh local schema import, the action row still appeared as `2085120`. Verify the row after schema load and patch it through `daptin-cli` if needed.

Security impact:

- GuestExecute on `document` does not grant guest create/update/delete.
- The individual action row still gates which document actions guests can run.
- Public document rows still require row-level public read (`16259`) to expose data.

## Operator Provisioning Shape

Canaster's template row should be provisioned with:

```bash
npm run daptin:provision-share-template -- \
  --site-ref <site_reference_id> \
  --config <daptin_cli_config>
```

This creates or updates:

```json
{
  "type": "template",
  "name": "CanasterDocument",
  "mime_type": "text/html",
  "content": "subsite://<site_reference_id>/index_with_og.html",
  "url_pattern": "[\"/d/:username/:slug\"]",
  "action_config": "{\"action\":\"get_canaster_document_by_public_path\",\"type\":\"document\"}",
  "cache_config": "{}",
  "headers": "{}"
}
```

Restart Daptin after creating this row unless it was created before startup.

## Production Deploy Attempt 2026-06-30

What succeeded:

- Commit `42587ec17766c785d6e8d7d4a9c673385d29a5b9` was pushed to `main`.
- GitHub Actions run `28465332292` completed successfully.
- The workflow built and deployed image `asia-south1-docker.pkg.dev/agent4-471206/canaster/daptin:42587ec17766c785d6e8d7d4a9c673385d29a5b9`.
- The workflow built `dist/index_with_og.html` and uploaded it to `gs://canaster-daptin-storage/canaster/index_with_og.html`.
- The workflow deployed the new Daptin container to `canaster-daptin-vm` and its built-in runtime smoke passed.

Post-deploy Daptin state verified through `daptin-cli`:

```bash
daptin-cli --endpoint https://api.canaster.in --output json list world --filter table_name=document --page-size 1
```

Result:

```text
world.permission(document): 1003811
world_schema_json.DefaultPermission(document): 16256
```

What is still blocked:

- `get_canaster_document_by_public_path` is not registered on production:

```bash
daptin-cli --endpoint https://api.canaster.in describe action document get_canaster_document_by_public_path
```

Returned:

```text
action "get_canaster_document_by_public_path" not found on "document"
```

- Creating the missing `action` row through `daptin-cli create action ...` returned `403 TableAccessPermissionChecker`.
- Listing or provisioning `site` and `template` rows through `daptin-cli` returned `403 TableAccessPermissionChecker` or `entity "site"/"template" not found`.
- Fresh password signin for `admin@canaster.in` returned `403` because production intentionally disabled the built-in guest `signin` action.
- The retained CLI token decodes to `admin@canaster.in`, but the admin user's `administrators` relation row has permission `561441`. Updating that relation row to `2097151` through `daptin-cli` also returned `403 TableAccessPermissionChecker`.
- Local `gcloud compute ssh` could not inspect or restart the VM after the deploy because the local `gcloud` account required interactive reauthentication.

Browser smoke:

```text
https://canaster.in/d/share-e2e-admin-483921/E2E-Workspace
```

Returned HTTP `200` and the Canaster SPA hydrated to the sign-in flow, but the page head was the static fallback:

```text
title: Canway
description: empty
canonical: empty
og:title: empty
og:url: empty
twitter:card: empty
```

Interpretation:

- The production site upload is live.
- The frontend path handling is live.
- The Daptin routed-template metadata is not live because the production `template` row is not present or not registered.
- The remaining production work requires an admin-capable Daptin CLI session or a refreshed local GCP session to inspect the VM and restart after the template row is provisioned.

## Production Repair 2026-07-01

The earlier production blocker was misdiagnosed. The `canaster-prod-share`
`daptin-cli` context had a token string, so the CLI printed `authenticated`, but
the JWT had expired at `2026-06-21T08:01:01Z`. Daptin resolved requests with
that expired bearer token as guest, which made `site`, `template`, and `action`
reads look like admin permission failures.

Password `signin` had also been locked at `2085120`, so the expired admin token
could not be refreshed through normal `daptin-cli execute user_account signin`.
For this one repair, the production `action` row was updated directly through
Cloud SQL:

```sql
update action
   set permission = 2085152,
       updated_at = now()
 where action_name = 'signin'
 returning action_name, permission, encode(reference_id, 'hex') as reference_id;
```

Verified result:

```text
signin permission: 2085152
signin reference_id: 019ecca4f4977b69973ecd38a03aa33b
```

After that, password signin succeeded through `daptin-cli` for
`admin@canaster.in`, refreshing the active `canaster-prod-share` token:

```text
iat: 2026-07-01T05:57:59Z
exp: 2026-07-04T05:57:59Z
```

With the fresh token, the routed action was verified as already present:

```text
get_canaster_document_by_public_path permission: 2085152
reference_id: 019f19b2-7ed4-79f1-abe5-10a773cc211e
```

The production template row was then provisioned through `daptin-cli` only:

```bash
scripts/provision-canaster-share-template.sh \
  --site-ref 019ed10a-0db4-7919-b7b2-13e0ca7a7dbd \
  --allow-default-context
```

Created row:

```text
name: CanasterDocument
reference_id: 019f1c44-0faf-71ad-ac44-75fbfe877b18
content: subsite://019ed10a-0db4-7919-b7b2-13e0ca7a7dbd/index_with_og.html
url_pattern: ["/d/:username/:slug"]
action_config: {"action":"get_canaster_document_by_public_path","type":"document"}
```

Daptin was restarted after creating the template row. Logs confirmed route
registration:

```text
Got [1] Templates from database
ProcessTemplateRoute [CanasterDocument] ["/d/:username/:slug"]
TemplateRoute [/d/:username/:slug] => CanasterDocument
```

A temporary smoke document was used for the first route check, then deleted:

```text
document_name: canaster-smoke/Production-OG-Smoke.canaster.json
reference_id: 019f1c45-0648-7744-87c0-23da7db50068
permission: 16259
deleted: 2026-07-01
```

A real existing production document was made routeable and public-readable for
the durable shared-document verification:

```text
document_name: canaster-admin/Canaster-Introduction.canaster.json
reference_id: 019f197f-9f2c-758b-ab56-ac1cd8794a4d
permission: 16259
```

Browser verification URL:

```text
https://canaster.in/d/canaster-admin/Canaster-Introduction
```

Verified server-rendered head:

```text
title: Canaster-Introduction | Canaster
description: Open this Canaster workspace to inspect, update, and organize work visually.
robots: index,follow
canonical: https://canaster.in/d/canaster-admin/Canaster-Introduction
og:title: Canaster-Introduction
og:url: https://canaster.in/d/canaster-admin/Canaster-Introduction
og:image: https://canaster.in/og-image.svg
twitter:card: summary_large_image
```

Daptin CLI/product gotcha: `daptin-cli context list` currently treats token
presence as `authenticated`; it does not warn when the stored JWT is expired.
When debugging a permission failure with a retained token, decode `exp` first.

## Current Canaster Files

- `daptin/schema_canaster_share.yaml`: schema action that exposes `.document`.
- `index_with_og.html`: Daptin-rendered HTML entry for share metadata.
- `vite.config.ts`: multi-entry Vite config for `index.html` and `index_with_og.html`.
- `scripts/provision-canaster-share-template.sh`: guarded `daptin-cli` provisioning script.
- `src/core/documentSlug.ts`: shared title-to-slug normalizer.
- `src/infra/browser/workspaceUrlLocation.ts`: parses `/d/:username/:slug` and creates share URLs.
- `src/infra/daptin/canasterDocuments.ts`: saves `document_name` using the public owner slug and document slug.
- `src/ui/App.tsx`: copies slugged share URLs only after an online document exists.
