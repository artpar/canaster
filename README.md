# Canaster

Canaster is a nested visual canvas workspace. The frontend owns the canvas experience; Daptin owns the backend boundary.

## Backend

The backend setup is defined in:

- `daptin/schema_canaster.yaml`
- `docker-compose.daptin.yml`
- `deploy/daptin/Dockerfile`
- `docs/daptin-backend-groundwork.md`

Local backend:

```bash
npm run daptin:up
npm run daptin:logs
npm run daptin:down
```

Verification:

```bash
npm run build
npm run daptin:smoke
```
