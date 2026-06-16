# Canaster

Canaster is a nested visual canvas workspace. The frontend owns the canvas experience; Daptin owns the backend boundary.

## Backend

The backend setup is defined in:

- `docker-compose.daptin.yml`
- `deploy/daptin/Dockerfile`
- `daptin/README.md`
- `docs/daptin-backend-groundwork.md`
- `docs/daptin-canaster-architecture-plan.md`

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
