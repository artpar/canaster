# Canaster Daptin MVP Architecture Plan

Status: historical MVP architecture plan with some still-useful Daptin storage notes. Do not follow this document for current source paths, adapter names, or implementation sequence.
Date: 2026-06-15.

Current source uses `src/infra/daptin/*`, not `src/backend/*`. Current contracts live in `docs/README.md`, `docs/architecture-software-kt.md`, `PRODUCT.md`, `DESIGN.md`, and `docs/canaster-user-journeys.md`.

Original purpose: this was the concrete backend plan for MVP delivery. The MVP persists each Canaster workspace as one JSON file blob in Daptin's built-in `document` entity. Do not add a custom Canaster backend service and do not add a custom Canaster table for MVP.

## Verified Ground Truth

These points were verified against Daptin `v0.12.17`, local Daptin docs/source, `daptin-cli`, `daptin-client@0.7.12`, and isolated runtime probes.

- Daptin already has a built-in `document` table.
- Built-in `document` has `document_name`, `document_path`, `document_extension`, `mime_type`, and `document_content`.
- `document_content` is `ColumnType: file.*`.
- File columns accept an array of file objects: `{ name, file, type }`.
- The `file` value must be a data URI such as `data:application/json;base64,<payload>`.
- Creating a built-in `document` row with `document_content` as an `application/json` data URI works.
- Reading that row returns `document_content` as a JSON string containing the file array.
- Decoding `document_content[0].file` returns the original Canaster JSON payload.
- Through `daptin-client@0.7.12`, `jsonApi.create('document', payload)` and `jsonApi.update('document', { id, ...payload })` work when `document_content` is sent as `JSON.stringify(fileArray)`.
- `daptin-client@0.7.12` runtime `jsonApi.update` expects the row `id` inside the payload. Do not use the three-argument signature from the type file.
- In the original local probe, built-in `document` rows were created with `permission: 2097151`; passing `permission: 16256` during create was ignored.
- PATCHing the created row to `permission: 16256` works.
- After PATCH to `16256`, unauthenticated GET returns `403`.
- PATCHing the row to `permission: 16259` makes the row public-readable.
- Production after admin lockdown must separately allow `document` table create/update/delete for the intended caller. As of the 2026-07-02 access-groups pass, production should use `world.permission(document)=1003811`, a schema-managed `Tables[].AccessGroups(document -> users)` relation with `permission=999424`, and `world_schema_json.DefaultPermission=16256`. This lets authenticated normal users create/update/delete and owner-read `document` rows without granting Group Read, while anonymous `POST`, `PATCH`, and `DELETE` on `document` return `403`; anonymous `GET` only works for rows explicitly made public-readable by the schema-managed visibility action. The extra `GuestExecute` bit is required so Daptin can execute the schema action behind `/d/:username/:slug`.

## MVP Decisions

- Use Daptin built-in `document`.
- Store the entire Canaster workspace as one JSON file in `document.document_content`.
- Do not use `space`, `plane`, `snapshot`, or `canaster_document`.
- Do not implement collaboration in MVP.
- Do not implement private sharing in MVP.
- Do not require YJS in MVP.
- Keep Dexie/localStorage as local offline cache and fast restore.
- Use Daptin as the signed-in durable sync target.

## Daptin Storage Shape

Each Canaster workspace is one `document` row:

```ts
type CanasterDocumentRow = {
  type: 'document';
  id: string;
  attributes: {
    document_name: string;
    document_path: string;
    document_extension: 'json';
    mime_type: 'application/json';
    document_content: string;
    permission: number;
  };
};
```

`document_content` is a JSON string. Parse it as:

```ts
type DaptinFileArray = Array<{
  name: string;
  file: string;
  type: string;
}>;

const files = JSON.parse(row.attributes.document_content) as DaptinFileArray;
const base64 = files[0].file.split(',')[1];
const snapshot = JSON.parse(new TextDecoder().decode(base64ToBytes(base64)));
```

Write it as:

```ts
const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
const file = {
  name: `${documentKey}.canaster.json`,
  file: `data:application/json;base64,${bytesToBase64(bytes)}`,
  type: 'application/json',
};
const documentContentForSdk = JSON.stringify([file]);
```

## Canaster File Format

The JSON file payload is exactly the current `CanvasWorkspaceSnapshot`:

```ts
type CanvasWorkspaceSnapshot = {
  schemaVersion: 1;
  history: {
    present: CanvasDocumentCollection;
    undoStack: CanvasDocumentCollection[];
    redoStack: CanvasDocumentCollection[];
  };
  lastModelChange: DocumentModelChange | null;
};
```

Do not split `history.present`, `undoStack`, `redoStack`, cameras, selections, pane layouts, or nested canvas documents into separate Daptin rows for MVP.

## Create Flow

Prerequisite: the Daptin `world` row for `table_name=document` must allow table-level create and update for the intended caller. The row-level create sequence below does not bypass table metadata permissions.

Because Daptin deployments can create built-in `document` rows with broad default permission unless configured otherwise, do not create a row with real user content first.

On production, grant the built-in `users` usergroup access to the `document` world row:

- `world.permission(document)=1003811` (`Guest: Peek, Read, Execute`, `Owner: Read, Execute`, `Group: Peek, Create, Update, Delete, Execute`)
- `world.usergroup_id -> users` relation permission `999424` (`Group: Peek, Create, Update, Delete, Execute`, no Group Read)
- `world_schema_json.DefaultPermission=16256`

Use `Tables[].AccessGroups` to ensure the `document -> users` generated relation row has `permission=999424`, then verify with `daptin-cli related world <document_world_ref> usergroup_id` when investigating production state. Do not use direct SQL, `GuestCreate`, `GuestUpdate`, or Group Read to make signed-in saves work.

Use this exact sequence:

1. Generate a client document key with `crypto.randomUUID()`.
2. Create a placeholder `document` row with non-sensitive placeholder content:
   - `document_name`: `pending.canaster.json`
   - `document_path`: `/canaster/pending/<documentKey>.canaster.json`
   - `document_extension`: `json`
   - `mime_type`: `application/json`
   - `document_content`: `JSON.stringify([{ name, file, type }])`, where `file` contains JSON payload `{ "schemaVersion": 1, "pending": true }`
3. Immediately PATCH the returned row to `permission: 16256`.
4. PATCH the same row with the real title/path/content:
   - `document_name`: `<public-account-slug>/<title>.canaster.json`, where the public account slug comes from `user_account.name` / the JWT `name` claim.
   - `document_path`: `/canaster/documents/<documentRef>.canaster.json`
   - `document_content`: full `CanvasWorkspaceSnapshot` JSON file.

This avoids exposing real workspace data during the create/permission gap.

## Permissions

MVP uses only private and public documents.

- Private: row `permission = 16256`
- Public readable: row `permission = 16259`

Visibility metadata is derived from `permission` for MVP:

- `16256` means private.
- `16259` means public read.

Do not implement private sharing in MVP. It needs separate product UI and token/group behavior verification.

## Historical Frontend Adapter Plan

Do not follow these paths for current source. They are preserved to show the original MVP plan. The current implementation boundary is under `src/infra/daptin/*`.

Add `src/backend/daptinClient.ts`:

- creates one `DaptinClient`;
- owns endpoint selection from env;
- owns token getter/setter;
- calls `worldManager.loadModel('document', false)` before JSON:API use;
- uses `jsonApi.create('document', payload)` for creates;
- uses `jsonApi.update('document', { id: documentRef, ...payload })` for updates;
- exports typed functions, not a raw global client.

Add `src/backend/canasterDocuments.ts`:

- `listDocuments()`
- `createDocument(title, initialSnapshot)`
- `loadDocument(documentRef)`
- `saveDocument(documentRef, snapshot)`
- `makeDocumentPrivate(documentRef)`
- `makeDocumentPublic(documentRef)`
- `deleteDocument(documentRef)`

Only `canasterDocuments.ts` may encode/decode Daptin file arrays. React components, `CanvasEngine`, `documentModel`, and `workspaceHistory` must only handle typed `CanvasWorkspaceSnapshot`.

## Local Cache

Dexie/localStorage remains in place.

Load order:

1. If signed in and a Daptin document is selected, load from Daptin.
2. If Daptin load fails, load the local cached copy and mark it dirty.
3. If not signed in, use local anonymous draft storage.

Save order:

1. Save local mirror first.
2. If signed in and document has a Daptin `documentRef`, PATCH Daptin `document_content`.
3. If Daptin save fails, keep local dirty state and retry.

## Implementation Sequence

1. Keep `daptin/schema_canaster.yaml` removed for app state. Do not reintroduce the stale `space`, `plane`, and `snapshot` schema before Daptin integration.
2. Use the persistent local Daptin instance for backend validation. The old `scripts/daptin-smoke.mjs` direct-backend smoke script has been removed because current backend-operation rules forbid custom HTTP probes. Replacement automation must use `daptin-cli` for non-UI backend operations or the running Canaster app UI for account/document flows. It still needs to prove:
   - create placeholder document;
   - patch private permission;
   - patch real JSON content;
   - read and decode content;
   - verify guest gets `403`;
   - patch public permission;
   - verify guest can read.
3. Add `src/backend/daptinClient.ts`.
4. Add `src/backend/canasterDocuments.ts`.
5. Wire sign-in state into the React shell.
6. Add minimal document open/create UI outside `NestedCanvasWorkspace`.
7. Change `NestedCanvasWorkspace` persistence boundary so Daptin save/load sits outside engine/model helpers.
8. Keep Dexie/localStorage as fallback cache.
9. Run rule-compliant static verification and manually verify the relevant app UI flows against the persistent local Daptin instance.
10. Deploy the same flow to production only after local MVP persistence works.

## Verification Gates

Run before calling MVP backend persistence complete:

```bash
npm run daptin:up
npm run dev:local
npm run verify:static
```

The static gate proves TypeScript correctness, dependency audit status, and whitespace/conflict-marker cleanliness. It does not prove Daptin integration.

Manual app UI verification or future `daptin-cli`-backed automation must prove:

- built-in `document` exists;
- `document_content` stores and returns an `application/json` file payload;
- the decoded payload hydrates as `CanvasWorkspaceSnapshot`;
- create uses placeholder first;
- private PATCH to `16256` hides the row from guest;
- public PATCH to `16259` exposes the row to guest;
- save/load round-trips nested documents, active canvas, view cameras, pane layouts, undo stack, redo stack, and `lastModelChange`.

## Future, Not MVP

- Private sharing.
- Collaborative editing.
- YJS wiring.
- Live nested engines over Daptin transport.
- Per-user invite flow.
- Custom schema tables.
- Server-side atomic private document creation.
