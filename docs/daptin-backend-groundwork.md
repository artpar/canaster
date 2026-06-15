# Canaster Daptin Backend Groundwork

## Backend Boundary

Canaster uses Daptin as the backend. The frontend owns nested canvas rendering, canvas interaction, and local interaction state. Daptin owns auth, users, groups, permissions, schema, CRUD, relationships, snapshots, static site hosting, live topics, and YJS transport.

There is no Canaster-specific API server in v1.

## Daptin Responsibilities

- Auth: use Daptin `user_account` actions for signup, signin, password reset, and future OAuth.
- Authorization: use Daptin owner rows, `DefaultPermission: 16256`, `usergroup_id`, and access APIs.
- Persistence: use Daptin JSON:API CRUD for `space`, `plane`, and `snapshot`.
- Relationships: use Daptin relation columns exactly as defined in `daptin/schema_canaster.yaml`.
- Static hosting: use Daptin `site` records backed by a `cloud_store`.
- Collaboration: use Daptin `/yjs/{document}` for live plane documents and `/live` for presence/events.
- Auditing: enable audit on authoring rows (`space`, `plane`) and keep autosave snapshots non-audited.

## Schema Contract

`daptin/schema_canaster.yaml` is the backend schema source of truth.

- `space` is the top-level user-owned workspace and sharing unit.
- `plane` is a nested visual plane. Every plane belongs to one `space`; root planes have no `parent_plane_id`; child planes use `parent_plane_id`.
- `snapshot` stores full restore state, including the collection state and undo/redo history.

Relation columns are fixed:

- `plane.space_id`: required, Daptin `belongs_to space`.
- `plane.parent_plane_id`: nullable, Daptin `has_one plane`.
- `snapshot.space_id`: required, Daptin `belongs_to space`.

The app must not construct generated join table names. It can pass Daptin `reference_id` values and named relation columns to the SDK.

## Local Backend

Permanent local backend uses Docker Postgres plus Daptin:

```bash
npm run daptin:up
npm run daptin:logs
npm run daptin:down
```

Local service defaults:

- Daptin API: `http://localhost:6336`
- Daptin container port: `8080`
- Postgres service: `postgres:5432`
- Database: `canaster`
- User: `canaster`
- Password: `canaster`
- Schema folder: `/opt/daptin/schema`
- Daptin storage: `/data/storage`

The compose file mounts `./daptin` as `DAPTIN_SCHEMA_FOLDER`, so schema changes require a Daptin container restart.

## Production Backend

Production runs Daptin on Google Cloud Run with Cloud SQL for PostgreSQL and a Cloud Storage volume mounted at `/data/storage`.

Fixed production defaults:

- GCP project: `agent4-471206`
- Region: `asia-south1`
- Artifact Registry repository: `canaster`
- Cloud Run service: `canaster-daptin`
- Cloud SQL instance: `canaster-postgres`
- Cloud SQL database: `canaster`
- Cloud SQL user: `canaster`
- Storage bucket: `canaster-daptin-storage`
- Cloud DNS zone: `canaster-in`
- Load balancer IP address name: `canaster-lb-ip`
- Serverless NEG: `canaster-daptin-neg`
- Public hostname: `canaster.in`
- Daptin site store: `canaster-site`
- Daptin site path: `/canaster`

The Cloud Run service is capped at `--max-instances=1` for v1. Daptin’s DB state is safe in Cloud SQL, but Daptin site/YJS/file storage uses a mounted Cloud Storage filesystem and the current collaboration design has not yet been validated for multi-instance concurrent write semantics.

## Production Image

`deploy/daptin/Dockerfile` builds a thin Canaster Daptin image:

- Base image: `daptin/daptin:v0.12.17`
- Bakes `schema_canaster.yaml` into `/opt/canaster/schema`
- Uses `/opt/canaster/entrypoint.sh`
- Reads `PORT` from Cloud Run
- Requires `DAPTIN_DB_CONNECTION_STRING`
- Uses `DAPTIN_LOCAL_STORAGE_PATH=/data/storage`
- Runs Daptin with `-db_type postgres` and `-olric_env local`

## GCP One-Time Setup

Do these once from a machine authenticated with `gcloud`. These commands create real cloud resources and are intentionally not run by CI.

```bash
export GCP_PROJECT=agent4-471206
export GCP_REGION=asia-south1
export GCP_ARTIFACT_REPOSITORY=canaster
export GCP_DAPTIN_SERVICE=canaster-daptin
export GCP_SQL_INSTANCE=canaster-postgres
export GCP_SQL_DATABASE=canaster
export GCP_SQL_USER=canaster
export GCP_STORAGE_BUCKET=canaster-daptin-storage

gcloud config set project "$GCP_PROJECT"
gcloud config set run/region "$GCP_REGION"

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  dns.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com

gcloud artifacts repositories create "$GCP_ARTIFACT_REPOSITORY" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Canaster runtime images"

gcloud sql instances create "$GCP_SQL_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$GCP_REGION" \
  --storage-type=SSD \
  --storage-size=10GB

gcloud sql databases create "$GCP_SQL_DATABASE" \
  --instance="$GCP_SQL_INSTANCE"

gcloud sql users create "$GCP_SQL_USER" \
  --instance="$GCP_SQL_INSTANCE" \
  --password="$(openssl rand -base64 32)"

gcloud storage buckets create "gs://$GCP_STORAGE_BUCKET" \
  --location="$GCP_REGION" \
  --uniform-bucket-level-access

gcloud dns managed-zones create canaster-in \
  --dns-name=canaster.in. \
  --description="Canaster production DNS"
```

The `canaster-in` zone was created in `agent4-471206` on 2026-06-15 with these Google Cloud DNS nameservers:

- `ns-cloud-a1.googledomains.com`
- `ns-cloud-a2.googledomains.com`
- `ns-cloud-a3.googledomains.com`
- `ns-cloud-a4.googledomains.com`

After the SQL user password exists, store the exact Daptin connection string in Secret Manager:

```bash
export GCP_SQL_CONNECTION_NAME="$(gcloud sql instances describe "$GCP_SQL_INSTANCE" --format='value(connectionName)')"
export DAPTIN_DB_PASSWORD='<paste-password-created-above>'

printf 'host=/cloudsql/%s user=%s password=%s dbname=%s sslmode=disable' \
  "$GCP_SQL_CONNECTION_NAME" \
  "$GCP_SQL_USER" \
  "$DAPTIN_DB_PASSWORD" \
  "$GCP_SQL_DATABASE" |
gcloud secrets create canaster-daptin-db-connection --data-file=-
```

## First Cloud Run Deploy

The first deploy can be run locally before CI is enabled:

```bash
export IMAGE="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$GCP_ARTIFACT_REPOSITORY/daptin:manual-$(git rev-parse --short HEAD)"
export GCP_SQL_CONNECTION_NAME="$(gcloud sql instances describe "$GCP_SQL_INSTANCE" --format='value(connectionName)')"

gcloud builds submit \
  --project "$GCP_PROJECT" \
  --config deploy/gcp/cloudbuild-daptin.yaml \
  --substitutions "_IMAGE=$IMAGE" \
  .

gcloud run deploy "$GCP_DAPTIN_SERVICE" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --project "$GCP_PROJECT" \
  --execution-environment gen2 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 300 \
  --set-cloudsql-instances "$GCP_SQL_CONNECTION_NAME" \
  --set-secrets DAPTIN_DB_CONNECTION_STRING=canaster-daptin-db-connection:latest \
  --set-env-vars DAPTIN_SCHEMA_FOLDER=/opt/canaster/schema,DAPTIN_LOCAL_STORAGE_PATH=/data/storage,DAPTIN_STORAGE=/data/storage \
  --add-volume name=daptin-storage,type=cloud-storage,bucket="$GCP_STORAGE_BUCKET" \
  --add-volume-mount volume=daptin-storage,mount-path=/data/storage
```

## Public Domain And Namecheap Handoff

`asia-south1` is not supported by Cloud Run direct domain mapping, so production uses a global external Application Load Balancer with a serverless NEG. The NEG and Cloud Run service stay in `asia-south1`; the HTTPS frontend is global.

Create the load balancer after the Cloud Run service exists:

```bash
export GCP_PROJECT=agent4-471206
export GCP_REGION=asia-south1
export GCP_DAPTIN_SERVICE=canaster-daptin

gcloud compute addresses create canaster-lb-ip --global

gcloud compute network-endpoint-groups create canaster-daptin-neg \
  --region="$GCP_REGION" \
  --network-endpoint-type=serverless \
  --cloud-run-service="$GCP_DAPTIN_SERVICE"

gcloud compute backend-services create canaster-daptin-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED

gcloud compute backend-services add-backend canaster-daptin-backend \
  --global \
  --network-endpoint-group=canaster-daptin-neg \
  --network-endpoint-group-region="$GCP_REGION"

gcloud compute ssl-certificates create canaster-managed-cert \
  --domains=canaster.in,www.canaster.in \
  --global

gcloud compute url-maps create canaster-url-map \
  --default-service=canaster-daptin-backend

gcloud compute target-https-proxies create canaster-https-proxy \
  --ssl-certificates=canaster-managed-cert \
  --url-map=canaster-url-map

gcloud compute forwarding-rules create canaster-https-rule \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --address=canaster-lb-ip \
  --target-https-proxy=canaster-https-proxy \
  --ports=443

mkdir -p .tmp/gcp
cat > .tmp/gcp/canaster-http-redirect.yaml <<'YAML'
name: canaster-http-redirect
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
YAML

gcloud compute url-maps import canaster-http-redirect \
  --global \
  --source=.tmp/gcp/canaster-http-redirect.yaml

gcloud compute target-http-proxies create canaster-http-proxy \
  --url-map=canaster-http-redirect

gcloud compute forwarding-rules create canaster-http-rule \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --address=canaster-lb-ip \
  --target-http-proxy=canaster-http-proxy \
  --ports=80
```

Then create Cloud DNS records pointing to the load balancer:

```bash
export CANASTER_LB_IP="$(gcloud compute addresses describe canaster-lb-ip --global --format='value(address)')"

gcloud dns record-sets create canaster.in. \
  --zone=canaster-in \
  --type=A \
  --ttl=300 \
  --rrdatas="$CANASTER_LB_IP"

gcloud dns record-sets create www.canaster.in. \
  --zone=canaster-in \
  --type=A \
  --ttl=300 \
  --rrdatas="$CANASTER_LB_IP"

gcloud dns managed-zones describe canaster-in --format='value(nameServers)'
```

Give the output name servers to Namecheap. In Namecheap, set `canaster.in` to Custom DNS and replace the Namecheap nameservers with the Google Cloud DNS nameservers returned by the last command. Do not add separate Namecheap host records if Cloud DNS is authoritative.

After the Namecheap nameserver change propagates:

```bash
dig +short NS canaster.in
dig +short A canaster.in
dig +short A www.canaster.in
gcloud compute ssl-certificates describe canaster-managed-cert --global --format='value(managed.status)'
```

## Daptin Site Bootstrap

After the first Daptin deploy is healthy, create the Daptin admin user, storage, and site using Daptin itself.

```bash
export DAPTIN_ENDPOINT="$(gcloud run services describe "$GCP_DAPTIN_SERVICE" --region "$GCP_REGION" --format='value(status.url)')"
export DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml
export DAPTIN_ADMIN_EMAIL=admin@canaster.in
export DAPTIN_ADMIN_PASSWORD='<admin-password>'

daptin-cli context add prod "$DAPTIN_ENDPOINT"
daptin-cli context set prod
daptin-cli execute user_account signup "email=$DAPTIN_ADMIN_EMAIL" "name=Canaster Admin" "password=$DAPTIN_ADMIN_PASSWORD" "passwordConfirm=$DAPTIN_ADMIN_PASSWORD"
daptin-cli execute user_account signin "email=$DAPTIN_ADMIN_EMAIL" "password=$DAPTIN_ADMIN_PASSWORD"
daptin-cli execute world become_an_administrator
daptin-cli storage add canaster-site --type local --store-provider local --root-path /data/storage --restart
daptin-cli create site name=canaster hostname=canaster.in path=canaster enable=true site_type=static
export CANASTER_SITE_REF="$(daptin-cli --output json list site --filter name=canaster --columns reference_id --page-size 1 | jq -r '.[0].reference_id // .[0].attributes.reference_id')"
export CANASTER_SITE_STORE_REF="$(daptin-cli --output json list cloud_store --filter name=canaster-site --columns reference_id --page-size 1 | jq -r '.[0].reference_id // .[0].attributes.reference_id')"
daptin-cli relate site "$CANASTER_SITE_REF" cloud_store_id "$CANASTER_SITE_STORE_REF"
```

This is a one-time Daptin data operation, not a Canaster schema addition.

## CI/CD

CI (`.github/workflows/ci.yml`) runs:

- `npm ci`
- TypeScript and Vite build
- Daptin schema smoke against the real Daptin `daptin/daptin:v0.12.17` image and Postgres 16

Production deploy (`.github/workflows/deploy-daptin.yml`) is disabled until `vars.GCP_DEPLOY_ENABLED` is set to `true`.

Required GitHub variables:

- `GCP_DEPLOY_ENABLED=true`
- `GCP_PROJECT=agent4-471206`
- `GCP_REGION=asia-south1`
- `GCP_ARTIFACT_REPOSITORY=canaster`
- `GCP_DAPTIN_SERVICE=canaster-daptin`
- `GCP_SQL_CONNECTION_NAME=agent4-471206:asia-south1:canaster-postgres`
- `GCP_STORAGE_BUCKET=canaster-daptin-storage`
- `GCP_LOAD_BALANCER_IP=canaster-lb-ip`
- `DAPTIN_SITE_STORE=canaster-site`
- `DAPTIN_SITE_PATH=/canaster`

Required GitHub secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `DAPTIN_ADMIN_EMAIL`
- `DAPTIN_ADMIN_PASSWORD`

Required Google Secret Manager secret:

- `canaster-daptin-db-connection`

## Frontend SDK Boundary

Install and use `daptin-client@0.7.12`.

The frontend adapter must expose only this Canaster-facing API:

- `signUp`, `signIn`, `signOut`
- `listSpaces`, `createSpace`, `loadSpace`
- `savePlane`, `saveSnapshot`, `loadCurrentSnapshot`
- `shareSpaceWithGroup`, `updateSpaceGroupPermission`, `removeSpaceGroup`
- `connectPlaneYjs(spaceRef, planeRef)`
- `connectSpaceLive(spaceRef)`

The adapter must not expose Daptin join table names or custom auth/share abstractions.

## Source References

- Daptin schema files are loaded from `schema_*.yaml` and can use `DAPTIN_SCHEMA_FOLDER`.
- Daptin `upload_system_schema` exists but is not the deployment path for production schema creation.
- Google Cloud Run injects `PORT`; the Canaster image entrypoint reads it.
- Cloud Run connects to Cloud SQL through `--set-cloudsql-instances` and the `/cloudsql/{connectionName}` socket path.
- Cloud Run can mount a Cloud Storage bucket as a filesystem volume; this is used for Daptin local storage.
- Cloud Run direct domain mappings are not used for production because they are preview-only, not recommended for production, and do not support `asia-south1`.
- The production custom domain uses a global external Application Load Balancer with a serverless NEG backend.
