# Canaster

Canaster is a nested visual canvas workspace. The frontend owns the canvas experience; Daptin owns the backend boundary.

## Docs

Start with `docs/README.md` for the current reading order. The contract set is:

- `PRODUCT.md`
- `DESIGN.md`
- `docs/canaster-user-journeys.md`
- `docs/architecture-software-kt.md`
- `docs/README.md`

## Backend

The backend setup is defined in:

- `docker-compose.daptin.yml`
- `deploy/daptin/Dockerfile`
- `daptin/README.md`
- `docs/daptin/daptin-backend-groundwork.md`

Local backend:

```bash
npm run daptin:up
npm run daptin:logs
npm run daptin:down
```

`daptin:up` runs the persistent local Canaster Daptin instance. It uses the named Docker volumes in `docker-compose.daptin.yml`, so account, document, asset, and mail data survive normal stop/start cycles. Do not remove the Compose volumes unless you intentionally want to reset local backend state.

Local app against the persistent Daptin instance:

```bash
npm run dev:local
```

Local development uses `http://canaster.local:5173` for the app and `http://canaster.local:6336` for Daptin. Mail testing also expects `mail.canaster.local` and `imap.canaster.local` to resolve to `127.0.0.1`.

Rapid local verification:

```bash
npm run verify:fast
```

Full rule-compliant static verification:

```bash
npm run verify:static
```

Do not use direct HTTP, `curl`, or custom Node probes for Daptin backend operations. Use the running Canaster app UI for account/document flows and `daptin-cli` for non-UI Daptin maintenance.
