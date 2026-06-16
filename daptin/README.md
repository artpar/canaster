# Canaster Daptin Backend

This directory is the backend contract for Canaster. Daptin is the backend; Canaster does not own a custom API server.

## Daptin Responsibilities

- Auth, users, groups, row ownership, and permission bitmasks.
- CRUD APIs for built-in `document`.
- Static hosting through Daptin `site` and `cloud_store` for production frontend delivery.
- JSON file blob persistence through `document.document_content`.

## Schema

MVP uses Daptin's built-in `document` table:

- `document_content`: one `application/json` file containing the full nested canvas snapshot, view state, and undo/redo history.

The older `space` / `plane` / `snapshot` schema is stale and must not be used for MVP backend integration. Do not add `canaster_document` for MVP. See `docs/daptin-canaster-architecture-plan.md` for the concrete built-in `document` file-blob plan.

Built-in `document` creates rows as public by default in the verified runtime, so the MVP create flow must create a harmless placeholder row, immediately PATCH `permission: 16256`, then PATCH the real JSON file content.

## Local Daptin Startup

Daptin loads `schema_*.yaml` files from its schema folder at startup. For permanent local development, use Docker Compose:

```bash
npm run daptin:up
npm run daptin:logs
npm run daptin:down
```

Local Daptin uses Postgres, not SQLite, to stay close to production.

Use `scripts/daptin-smoke.mjs` for the supported repo-level smoke flow:

```bash
npm run daptin:smoke
npm run daptin:smoke:local
```

`daptin:smoke` starts an isolated temporary Daptin. `daptin:smoke:local` verifies the permanent Compose instance at `http://localhost:6336`.

## SDK Boundary

Frontend code must use `daptin-client` and Daptin managers:

- `authManager` / `actionManager` for sign up, sign in, password reset, and actions.
- `worldManager` to load models before JSON:API calls.
- `jsonApi` for built-in `document` CRUD.
- file-array encode/decode helpers for `document_content`.

With `daptin-client@0.7.12`, send `document_content` as `JSON.stringify(fileArray)` through `jsonApi.create` and `jsonApi.update`. Decode reads by parsing the returned string.

Do not implement private sharing or collaboration in MVP.

## Production Deploy Shape

The production Daptin instance runs on Google Cloud Run and owns both API and static frontend hosting:

1. Run Daptin with Cloud SQL for PostgreSQL.
2. Mount a Cloud Storage bucket at `/data/storage`.
3. Start with an empty Canaster schema folder for MVP app state; use Daptin's built-in `document`.
4. Create an admin user and run the smoke test.
5. Create/link a GCS-backed Daptin `cloud_store` for static site files.
6. Create one Daptin `site` row per hostname. The currently working site rows are the two direct Cloud Run hostnames; `canaster.in` and `www.canaster.in` need their own site rows if they should serve the Canway frontend.
7. Keep `api.canaster.in` as the Daptin admin/API hostname and do not create a static site row for it.
8. CI builds the Daptin image, deploys Cloud Run, builds `dist/`, uploads it through `daptin-cli storage upload`, and probes the deployed runtime.

Current public TLS shape:

- `canaster.in` and `www.canaster.in` terminate on GCP managed certificate `canaster-managed-cert`.
- `api.canaster.in` terminates on GCP certificate resource `canaster-api-self-cert`, but that certificate material is issued by Daptin ACME and uploaded into GCP.
- As of 2026-06-16, `canaster.in` and `www.canaster.in` serve the Canway frontend, while `api.canaster.in` remains the Daptin admin/API hostname.

See `docs/daptin-backend-groundwork.md` for the exact GCP commands and required CI/CD variables.

## Required CI/CD Configuration

GitHub variables and secrets are listed in `docs/daptin-backend-groundwork.md`. Google Secret Manager must contain `canaster-daptin-db-connection`.
