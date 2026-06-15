# Canaster Daptin Backend

This directory is the backend contract for Canaster. Daptin is the backend; Canaster does not own a custom API server.

## Daptin Responsibilities

- Auth, users, groups, row ownership, and permission bitmasks.
- CRUD APIs for `space`, `plane`, and `snapshot`.
- Relationships through Daptin relation keys, not app-specific join tables.
- Sharing through the built-in `usergroup_id` relation and Daptin access APIs.
- Static hosting through Daptin `site` and `cloud_store` for production frontend delivery.
- Optional collaboration through Daptin `/yjs/{document}` and `/live` topics.
- Audit trail on user-authored `space` and `plane` rows.

## Schema

`schema_canaster.yaml` defines:

- `space`: the top-level user-owned container.
- `plane`: one nested visual plane in a space.
- `snapshot`: full-workspace restore and history state.

All app tables use `DefaultPermission: 16256`, meaning owner-only by default. Public or shared access must be granted with Daptin permissions/usergroups, not with custom Canaster share rows.

## Local Daptin Startup

Daptin loads `schema_*.yaml` files from its schema folder at startup. For permanent local development, use Docker Compose:

```bash
npm run daptin:up
npm run daptin:logs
npm run daptin:down
```

Local Daptin uses Postgres, not SQLite, to stay close to production.

Use `scripts/daptin-smoke.mjs` for the supported repo-level smoke flow.

## SDK Boundary

Frontend code must use `daptin-client` and Daptin managers:

- `authManager` / `actionManager` for sign up, sign in, password reset, and actions.
- `worldManager` to load models before JSON:API calls.
- `jsonApi` for `space`, `plane`, and `snapshot` CRUD.
- `relationshipManager` for `space_id`, `parent_plane_id`, and `usergroup_id`.
- `accessManager` for object/group permission changes.
- `yjsManager` for collaborative documents named `space:{spaceRef}:plane:{planeRef}`.
- `liveManager` for presence topics named `space:{spaceRef}`.

Do not construct generated join table names in Canaster code.

## Production Deploy Shape

The production Daptin instance runs on Google Cloud Run and owns both API and static frontend hosting:

1. Run Daptin with Cloud SQL for PostgreSQL.
2. Mount a Cloud Storage bucket at `/data/storage`.
3. Load `schema_canaster.yaml` through the baked startup schema folder.
4. Create an admin user and run the smoke test.
5. Create/link a Daptin `cloud_store` for static site files.
6. Create a `site` row for `canaster.in`.
7. CI builds the Daptin image, deploys Cloud Run, builds `dist/`, uploads it through `daptin-cli storage upload`, and probes the deployed runtime.

See `docs/daptin-backend-groundwork.md` for the exact GCP commands and required CI/CD variables.

## Required CI/CD Configuration

GitHub variables and secrets are listed in `docs/daptin-backend-groundwork.md`. Google Secret Manager must contain `canaster-daptin-db-connection`.
