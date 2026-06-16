# Canaster Daptin Backend Groundwork

## Backend Boundary

Canaster uses Daptin as the backend. The frontend owns nested canvas rendering and canvas interaction. Daptin owns auth, users, permissions, built-in `document` CRUD, file blob storage, and static site hosting.

There is no Canaster-specific API server in v1.

The concrete MVP backend architecture and implementation plan is `docs/daptin-canaster-architecture-plan.md`. That plan is based on verified Daptin docs/source/runtime behavior and supersedes both the earlier normalized `space` / `plane` / `snapshot` model and the temporary `canaster_document` proposal.

## Daptin Responsibilities

- Auth: use Daptin `user_account` actions for signup, signin, password reset, and future OAuth.
- Authorization: use Daptin row permissions on built-in `document`.
- Persistence: use Daptin JSON:API CRUD for built-in `document`.
- File storage: store one `application/json` file in `document.document_content`.
- Static hosting: use Daptin `site` records backed by a `cloud_store`.
- Collaboration: future work, not MVP.

## Schema Contract

`daptin/schema_canaster.yaml` was removed because it was stale for MVP app state.

- The MVP app table is Daptin built-in `document`.
- `document_content` stores the full Canaster snapshot as an `application/json` file blob.
- `space`, `plane`, and `snapshot` must be removed from the Canaster schema before frontend/backend integration.
- `canaster_document` must not be added for MVP.

The MVP should not define Canaster app entities or relationships in Daptin schema files.

The app must not construct generated object/usergroup join table names.

Permission rule:

- create built-in `document` rows with harmless placeholder content first;
- immediately PATCH private rows to `permission: 16256`;
- PATCH public rows to `permission: 16259`;
- private sharing and collaboration are future work, not MVP.

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

The compose file mounts `./daptin` as `DAPTIN_SCHEMA_FOLDER`. MVP app state does not add schema files; it uses Daptin's built-in `document`.

Current local status as of 2026-06-15 18:53 IST:

- `npm run daptin:up` starts local Daptin and local Postgres.
- Daptin is available at `http://localhost:6336`.
- Postgres uses the `canaster_postgres-data` Docker volume.
- Daptin storage uses the `canaster_daptin-data` Docker volume.
- Compose waits for Postgres health before starting Daptin.
- Verified with `curl http://localhost:6336/api/world?page%5Bsize%5D=5`.
- Verified with `npm run daptin:smoke:local`.

## Production Backend

Production runs Daptin on Google Cloud Run with Cloud SQL for PostgreSQL and a Cloud Storage volume mounted at `/data/storage`.

Fixed production defaults:

- GCP project: `agent4-471206`
- Region: `asia-south1`
- Artifact Registry repository: `canaster`
- Cloud Run service: `canaster`
- Cloud SQL instance: `canaster-postgres`
- Cloud SQL database: `canaster`
- Cloud SQL user: `canaster`
- Storage bucket: `canaster-daptin-storage`
- Cloud DNS zone: `canaster-in`
- Load balancer IP address name: `canaster-lb-ip`
- Serverless NEG: `canaster-neg`
- Public hostname: `canaster.in`
- Temporary working backend endpoint: `https://canaster-vnlupz4kzq-el.a.run.app`
- Daptin site store: `canaster-site`
- Daptin site path: `/canaster`

The Cloud Run service is capped at `--max-instances=1` for v1. Daptin’s DB state is safe in Cloud SQL, but Daptin site/file storage uses a mounted Cloud Storage filesystem. Multi-instance file write semantics are not part of MVP.

Current production status as of 2026-06-16 14:39 IST:

- Google Cloud project: `agent4-471206`.
- Cloud DNS zone `canaster-in` exists.
- Artifact Registry repository `canaster` exists in `asia-south1`.
- Cloud Storage bucket `canaster-daptin-storage` exists.
- Service account `canaster-daptin-run@agent4-471206.iam.gserviceaccount.com` exists.
- Cloud SQL instance `canaster-postgres` exists as Enterprise `db-g1-small`, 10 GB SSD.
- Secret Manager secret `canaster-daptin-db-connection` exists.
- Cloud Run service `canaster` exists and serves Canaster plus Daptin API paths from image `asia-south1-docker.pkg.dev/agent4-471206/canaster/daptin:manual-08745c7`.
- Direct Cloud Run verification passed with `HTTP 200` for `/api/world?page%5Bsize%5D=1`.
- Global load balancer IP `canaster-lb-ip` exists with address `8.232.13.111`.
- Serverless NEG `canaster-neg` exists in `asia-south1`.
- Backend service `canaster-backend` exists and points to `canaster-neg`.
- The retired old Cloud Run service, old serverless NEG, and old backend service were deleted after the URL map moved to `canaster-backend`.
- HTTPS frontend `canaster-https-rule` exists on `8.232.13.111:443`.
- HTTP frontend `canaster-http-rule` exists on `8.232.13.111:80` and redirects to HTTPS.
- Managed certificate `canaster-managed-cert` exists for `canaster.in` and `www.canaster.in`; it remains blocked until public DNS for the domain reaches the load balancer IP.
- Namecheap BasicDNS is currently authoritative from the registrar UI and has `A` records for `@` and `www`, both pointing to `8.232.13.111`.

The current cost-bearing production resource is Cloud SQL. The estimated always-on cost for `db-g1-small` plus 10 GB SSD/backups is roughly USD 28/month before traffic. Adding the HTTPS load balancer later is expected to add roughly USD 18/month.

Production deployment is live on the direct Cloud Run hostname. The remaining external blocker for `canaster.in` is public DNS propagation/delegation from Namecheap/NIXI to the Namecheap BasicDNS records.


## Production Image

`deploy/daptin/Dockerfile` builds a thin Canaster Daptin image:

- Base image: `daptin/daptin:v0.12.17`
- Creates an empty `/opt/canaster/schema` folder for MVP app state
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
export GCP_CLOUD_RUN_SERVICE=canaster
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

gcloud run deploy "$GCP_CLOUD_RUN_SERVICE" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --project "$GCP_PROJECT" \
  --service-account "canaster-daptin-run@$GCP_PROJECT.iam.gserviceaccount.com" \
  --execution-environment gen2 \
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

gcloud run services update "$GCP_CLOUD_RUN_SERVICE" \
  --project "$GCP_PROJECT" \
  --region "$GCP_REGION" \
  --no-invoker-iam-check
```

`--allow-unauthenticated` attempted to add `allUsers` as `roles/run.invoker`, but org policy blocked that binding with `FAILED_PRECONDITION: One or more users named in the policy do not belong to a permitted customer`. The deployed service therefore uses Cloud Run's invoker IAM check disable flag instead.

## Public Domain And Namecheap Handoff

`asia-south1` is not supported by Cloud Run direct domain mapping, so production uses a global external Application Load Balancer with a serverless NEG. The NEG and Cloud Run service stay in `asia-south1`; the HTTPS frontend is global.

Create the load balancer after the Cloud Run service exists:

```bash
export GCP_PROJECT=agent4-471206
export GCP_REGION=asia-south1
export GCP_CLOUD_RUN_SERVICE=canaster

gcloud compute addresses create canaster-lb-ip --global

gcloud compute network-endpoint-groups create canaster-neg \
  --region="$GCP_REGION" \
  --network-endpoint-type=serverless \
  --cloud-run-service="$GCP_CLOUD_RUN_SERVICE"

gcloud compute backend-services create canaster-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED

gcloud compute backend-services add-backend canaster-backend \
  --global \
  --network-endpoint-group=canaster-neg \
  --network-endpoint-group-region="$GCP_REGION"

gcloud compute ssl-certificates create canaster-managed-cert \
  --domains=canaster.in,www.canaster.in \
  --global

gcloud compute url-maps create canaster-url-map \
  --default-service=canaster-backend

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

### DNS Delegation Status

Current state as of 2026-06-15 18:36 IST:

- Google Cloud DNS API is enabled for `agent4-471206`.
- Google Cloud DNS managed zone `canaster-in` exists and is authoritative for `canaster.in.`.
- The owner updated Namecheap to use Google Cloud DNS custom nameservers.
- Google Cloud DNS authoritative servers already answer for the zone:

```bash
dig @ns-cloud-a1.googledomains.com +short SOA canaster.in
dig @ns-cloud-a1.googledomains.com +short NS canaster.in
```

Expected authoritative nameservers:

```text
ns-cloud-a1.googledomains.com
ns-cloud-a2.googledomains.com
ns-cloud-a3.googledomains.com
ns-cloud-a4.googledomains.com
```

Observed immediately after the Namecheap update:

```bash
dig +short NS canaster.in
dig @8.8.8.8 +short NS canaster.in
dig @1.1.1.1 +short NS canaster.in
dig @ns1.registry.in. +norecurse NS canaster.in
```

The public recursive resolvers returned no NS records, and the `.in` registry server returned `NXDOMAIN`. That means Namecheap has not yet propagated the delegation to the `.in` registry from the perspective of those resolvers. This is not a Google Cloud DNS zone problem; the Google authoritative zone exists and responds.

After the Namecheap nameserver change propagates, these commands must return the Google nameservers:

```bash
dig +short NS canaster.in
dig @8.8.8.8 +short NS canaster.in
dig @1.1.1.1 +short NS canaster.in
```

The `A` records for `canaster.in` and `www.canaster.in` should not be expected until the global load balancer IP is created and the Cloud DNS `A` records are added. After those records are created, verify:

```bash
dig +short A canaster.in
dig +short A www.canaster.in
gcloud compute ssl-certificates describe canaster-managed-cert --global --format='value(managed.status)'
```

Current state as of 2026-06-16 00:35 IST:

- Namecheap WHOIS shows the Google Cloud DNS nameservers for `canaster.in`.
- Google Cloud DNS authoritative nameserver `ns-cloud-a1.googledomains.com` returns `8.232.13.111` for both `canaster.in` and `www.canaster.in`.
- The `.in` registry authoritative server still returns the `in.` SOA for `canaster.in` instead of delegating to the Google Cloud DNS nameservers.
- Public recursive DNS therefore still does not resolve `canaster.in`.
- Forced-IP HTTP test works and returns `301 Moved Permanently` to HTTPS.
- Forced-IP HTTPS test fails during TLS while `canaster-managed-cert` is `PROVISIONING`.

Verification evidence:

```bash
dig @ns-cloud-a1.googledomains.com +short A canaster.in
# 8.232.13.111

dig @ns-cloud-a1.googledomains.com +short A www.canaster.in
# 8.232.13.111

curl --noproxy '*' -I --resolve canaster.in:80:8.232.13.111 'http://canaster.in/api/world?page%5Bsize%5D=1'
# HTTP/1.1 301 Moved Permanently
# Location: https://canaster.in:443/api/world?page%5Bsize%5D=1

gcloud compute ssl-certificates describe canaster-managed-cert \
  --global \
  --project agent4-471206 \
  --format='value(managed.status)'
# PROVISIONING
```

Next verification loop:

```bash
dig +short NS canaster.in
dig +short A canaster.in
gcloud compute ssl-certificates describe canaster-managed-cert \
  --global \
  --project agent4-471206 \
  --format='json(managed.status,managed.domainStatus)'
curl -I 'https://canaster.in/api/world?page%5Bsize%5D=1'
```

Current interim routing decision as of 2026-06-16 14:39 IST:

- Continue frontend/backend integration against the direct Cloud Run subdomain `https://canaster-vnlupz4kzq-el.a.run.app`.
- `.env.production` points `VITE_DAPTIN_ENDPOINT` to that Cloud Run subdomain until `canaster.in` resolves publicly and the managed certificate becomes visible.
- Local development still defaults to `http://localhost:6336`.
- To run the frontend locally against the deployed backend, use:

```bash
npm run dev:cloud
```

Namecheap BasicDNS now has these records and no `www` parking CNAME:

```text
@    A    8.232.13.111
www  A    8.232.13.111
```

The `.in` parent zone still needs to delegate `canaster.in` to `dns1.registrar-servers.com` and `dns2.registrar-servers.com` before public resolution can work.

### Permanent Local Site/GCS Verification

Current state as of 2026-06-16 14:15 IST:

- Do not use throwaway Daptin instances for Canaster backend/site validation.
- The permanent local setup is `docker-compose.daptin.yml` and runs Daptin plus Postgres.
- Docker Desktop must be running before `npm run daptin:up`.
- `npm run daptin:up` and `npm run daptin:smoke:local` passed against `http://localhost:6336`.
- Local GCS-backed site hosting was verified through the permanent local Daptin instance, not a temporary instance.

Local verification setup:

```text
Daptin endpoint: http://localhost:6336
Daptin store: canaster-site-local-gcs
Store type: google cloud storage
Store provider: Google
Root path: canaster-site-local-gcs:canaster-daptin-storage
Credential style: rclone config keys
Credential key used locally: access_token from gcloud auth print-access-token
Site hostname: localhost
Site path: /canaster-local
Uploaded GCS prefix: gs://canaster-daptin-storage/canaster-local/
```

Local verification evidence:

```bash
npm run build
npm run daptin:smoke:local
daptin-cli storage upload canaster-site-local-gcs:/canaster-local ./dist --recursive
gcloud storage ls gs://canaster-daptin-storage/canaster-local/index.html
docker compose -f docker-compose.daptin.yml restart daptin
curl --noproxy '*' -D - http://localhost:6336/ -o /tmp/canaster-local-site-index.html
```

Observed result:

```text
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
```

Daptin source behavior verified before using this flow:

- `site` rows are loaded into the host switch at Daptin startup in `server/subsites.go`.
- A Daptin restart is required after creating a new `site` row for that site to route by hostname.
- `cloud_store.upload_file` uploads to `cloudStore.root_path + "/" + path`.
- `site.sync_site_storage` reads from `cloudStore.root_path + "/" + site.path`.
- Therefore the production site path must match the upload prefix.
- For GCS, Daptin's rclone config is supplied through the linked credential content.
- Local verification used a short-lived `access_token`; production should use Cloud Run metadata credentials with rclone `env_auth=true`.

Permanent local smoke behavior:

- `npm run daptin:smoke:local` uses the existing CLI token in `.tmp/daptin/local-site-cli.yaml`.
- It does not sign up a new user against the permanent local Daptin server.
- It verifies built-in `document` JSON blob create/update/read, private guest `403`, public guest `200`, and snapshot decode.
- On 2026-06-16 14:52 IST the permanent local create permission was `561441`; the smoke does not depend on a specific create default and instead verifies the explicit private/public permission patches.

### Production Site/GCS Bootstrap Status

Current state as of 2026-06-16 14:39 IST:

- Production no longer serves only raw Daptin on the Cloud Run subdomains.
- The Canaster frontend build has been uploaded through Daptin to Google Cloud Storage.
- Daptin is serving the uploaded static site from GCS through `site` rows.
- The backend API remains available under Daptin's normal `/api/...` paths.
- The active public Cloud Run hostnames are `canaster-vnlupz4kzq-el.a.run.app` and `canaster-740552849684.asia-south1.run.app`; the old public Cloud Run service is deleted.

Production Daptin GCS store:

```text
cloud_store.name: canaster-site
cloud_store.store_type: google cloud storage
cloud_store.store_provider: Google
cloud_store.root_path: canaster-site:canaster-daptin-storage
cloud_store.credential_name: canaster-site
credential style: rclone config keys
production credential key: env_auth=true
production auth source: Cloud Run service account metadata
bucket: gs://canaster-daptin-storage
```

Production Daptin sites:

```text
hostname: canaster-vnlupz4kzq-el.a.run.app
path: /canaster
cloud_store: canaster-site

hostname: canaster-740552849684.asia-south1.run.app
path: /canaster
cloud_store: canaster-site
```

Important Daptin routing detail:

- Do not put multiple hostnames in one comma-separated `site.hostname` for Cloud Run service hostnames.
- Daptin splits comma-separated hostnames into `SiteMap`, but `HandlerMap` is keyed by the full `site.Hostname` string.
- For reliable hostname routing, create one `site` row per hostname.

Production verification commands:

```bash
daptin-cli storage upload canaster-site:/canaster ./dist --recursive
gcloud storage ls gs://canaster-daptin-storage/canaster/index.html
gcloud run services update canaster \
  --project agent4-471206 \
  --region asia-south1 \
  --update-env-vars CANASTER_SITE_BOOTSTRAP_REV="$(date +%s)" \
  --no-invoker-iam-check
curl --noproxy '*' -fsS https://canaster-vnlupz4kzq-el.a.run.app/ | rg '<title>Canway</title>'
curl --noproxy '*' -fsS https://canaster-740552849684.asia-south1.run.app/ | rg '<title>Canway</title>'
curl --noproxy '*' -fsS 'https://canaster-vnlupz4kzq-el.a.run.app/api/world?page%5Bsize%5D=1' >/dev/null
```

Observed result:

```text
https://canaster-vnlupz4kzq-el.a.run.app/ serves <title>Canway</title>
https://canaster-740552849684.asia-south1.run.app/ serves <title>Canway</title>
/api/world?page%5Bsize%5D=1 returns HTTP 200
```

## Daptin Site Bootstrap

After the first Daptin deploy is healthy, create the Daptin admin user, storage, and site using Daptin itself.

```bash
export DAPTIN_ENDPOINT="$(gcloud run services describe "$GCP_CLOUD_RUN_SERVICE" --region "$GCP_REGION" --format='value(status.url)')"
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

## Production Admin State

Current state as of 2026-06-16 15:13 IST:

- The retained bootstrap administrator account is `admin@canaster.in`.
- The account credentials are recorded in `production-admin-credentials.md`.
- `world.become_an_administrator` has already been consumed by the retained bootstrap admin account; later calls from another user return `403`.
- `artpar@gmail.com` exists as a normal user account and is related only to the `users` group.
- `admin@canaster.in` remains related to both `users` and `administrators`.

Verified with:

```bash
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli related user_account "$ARTPAR_USER_REF" usergroup_id
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli related user_account "$ADMIN_USER_REF" usergroup_id
```

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
- `GCP_CLOUD_RUN_SERVICE=canaster`
- `GCP_SQL_CONNECTION_NAME=agent4-471206:asia-south1:canaster-postgres`
- `GCP_STORAGE_BUCKET=canaster-daptin-storage`
- `GCP_LOAD_BALANCER_IP=canaster-lb-ip`
- `DAPTIN_SITE_STORE=canaster-site`
- `DAPTIN_SITE_PATH=/canaster`

Currently set GitHub repository variables as of 2026-06-16 14:48 IST:

- `GCP_CLOUD_RUN_SERVICE=canaster`

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
- `listDocuments`, `createDocument`, `loadDocument`
- `saveDocument`, `makeDocumentPrivate`, `makeDocumentPublic`
- `deleteDocument`

The adapter must not expose Daptin join table names, custom auth abstractions, sharing, or collaboration for MVP.

## Source References

- Daptin schema files are loaded from `schema_*.yaml` and can use `DAPTIN_SCHEMA_FOLDER`.
- Daptin `upload_system_schema` exists but is not the deployment path for production schema creation.
- Google Cloud Run injects `PORT`; the Canaster image entrypoint reads it.
- Cloud Run connects to Cloud SQL through `--set-cloudsql-instances` and the `/cloudsql/{connectionName}` socket path.
- Cloud Run can mount a Cloud Storage bucket as a filesystem volume; this is used for Daptin local storage.
- Cloud Run direct domain mappings are not used for production because they are preview-only, not recommended for production, and do not support `asia-south1`.
- The production custom domain uses a global external Application Load Balancer with a serverless NEG backend.
