# Canaster Daptin Backend Groundwork

## Backend Boundary

Canaster uses Daptin as the backend. The frontend owns nested canvas rendering and canvas interaction. Daptin owns auth, users, permissions, built-in `document` CRUD, file blob storage, and static site hosting.

There is no Canaster-specific API server in v1.

The concrete MVP backend architecture and implementation plan is `docs/daptin-canaster-architecture-plan.md`. That plan is based on verified Daptin docs/source/runtime behavior and supersedes both the earlier normalized `space` / `plane` / `snapshot` model and the temporary `canaster_document` proposal.

## Daptin Responsibilities

- Auth: use Daptin `user_account` actions for email OTP request/verify and future OAuth.
- Authorization: use Daptin row permissions on built-in `document`.
- Persistence: use Daptin JSON:API CRUD for built-in `document`.
- File storage: store one `application/json` file in `document.document_content`.
- Static hosting: use Daptin `site` records backed by a `cloud_store`.
- Collaboration: future work, not MVP.

## Schema Contract

`daptin/schema_canaster.yaml` was removed because it was stale for MVP app state. `daptin/schema_canaster_auth.yaml` is actions-only and exists for email OTP auth.

- The MVP app table is Daptin built-in `document`.
- `document_content` stores the full Canaster snapshot as an `application/json` file blob.
- `space`, `plane`, and `snapshot` must be removed from the Canaster schema before frontend/backend integration.
- `canaster_document` must not be added for MVP.

The MVP should not define Canaster app entities or relationships in Daptin schema files. Schema-managed auth actions are allowed.

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

Production runs one Daptin container directly on a Compute Engine VM with Cloud SQL for PostgreSQL. Daptin owns HTTP, HTTPS, static site routing, certificates, SMTP, and outbox processing; do not add Caddy or another reverse proxy for Canaster.

Fixed production defaults:

- GCP project: `agent4-471206`
- Region: `asia-south1`
- Artifact Registry repository: `canaster`
- VM name: `canaster-daptin-vm`
- VM zone: `asia-south1-c`
- VM static IP address name: `canaster-vm-ip`
- VM static IP: `34.14.185.249`
- Cloud SQL instance: `canaster-postgres`
- Cloud SQL database: `canaster`
- Cloud SQL user: `canaster`
- Storage bucket: `canaster-daptin-storage`
- Public frontend hostname target: `canaster.in`
- Public admin/API hostname target: `api.canaster.in`
- Preferred frontend build backend endpoint: `https://api.canaster.in`
- Daptin site store: `canaster-site`
- Daptin mail store: `canaster-mail`
- Daptin site path: `/canaster`

The VM deployment intentionally runs a single Daptin process. Daptin’s DB state is in Cloud SQL. Static site files remain in the GCS-backed Daptin `canaster-site` `cloud_store`, while raw SMTP/IMAP message bodies use the GCS-backed Daptin `canaster-mail` `cloud_store`.

Current production status as of 2026-06-24 15:29 IST:

- Google Cloud project: `agent4-471206`.
- Artifact Registry repository `canaster` exists in `asia-south1`.
- Cloud Storage bucket `canaster-daptin-storage` exists.
- Service account `canaster-daptin-run@agent4-471206.iam.gserviceaccount.com` exists.
- Cloud SQL instance `canaster-postgres` exists as Enterprise `db-g1-small`, 10 GB SSD.
- Secret Manager secret `canaster-daptin-vm-db-connection` exists and points at the Cloud SQL public IP authorized only for the VM static IP.
- VM `canaster-daptin-vm` exists in `asia-south1-c` with external IP `34.14.185.249`.
- VM firewall rules allow public TCP `80`, `443`, `25`, `465`, `587`, and `993` for tag `canaster-vm`, plus IAP SSH from `35.235.240.0/20`.
- Runtime image `asia-south1-docker.pkg.dev/agent4-471206/canaster/daptin:daptinfix-72c5f7d-20260625071519`, digest `sha256:721e8da70e401caa39e24b229936a439277b4485b3283beadcabdaefb44078e3`, is deployed.
- Daptin HTTP verification passed with `HTTP 200` for `Host: api.canaster.in` and `/api/world?page%5Bsize%5D=1`.
- Daptin HTTPS verification passed with `curl --resolve api.canaster.in:443:34.14.185.249 https://api.canaster.in/api/world?page%5Bsize%5D=1`.
- Daptin logs show `TLS server listening on port :6443`.
- Daptin logs show SMTP server setup for `mail.canaster.in` on `0.0.0.0:25`, `0.0.0.0:465`, and `0.0.0.0:587`.
- Daptin logs show IMAPS server setup for `imap.canaster.in` on `:993`.
- Daptin `cloud_store.name=canaster-mail`, reference `019edc18-5fe3-7370-be4f-ac76ded67a78`, points at `canaster-mail:canaster-daptin-storage` with credential `canaster-site` for cloud-store-backed raw `mail.mail` and `outbox.mail` bodies.
- Daptin `cloud_store.name=assets`, id `4`, points at `canaster-assets:canaster-daptin-storage` with credential `canaster-site` for image panel uploads.
- Daptin `world.permission(document)=741632` and `world.permission(asset)=741632`, both with `world_schema_json.DefaultPermission=16256`, and `world.usergroup_id -> users` relation permission `770048`. This gives signed-in users table-level create/update and row-level owner reads while keeping guest table CRUD closed.
- Production permission hardening on 2026-06-24 removed guest table access from sensitive system tables. `signin`, `signup`, `reset-password`, and `reset-password-verify` are not guest-executable. `request_canaster_email_otp` and `verify_canaster_email_otp` remain the only guest-executable auth actions. Daptin still serves `/api/world` and `/api/action` metadata to guests; do not store secrets in action schemas or world metadata.
- VM outbound SMTP verification passed for `gmail-smtp-in.l.google.com:25` and `smtp.gmail.com:465`.
- Public DNS is authoritative on Namecheap BasicDNS at `dns1.registrar-servers.com` and `dns2.registrar-servers.com`.
- Daptin `/_config/backend/hostname`, `/_config/backend/imap.enabled`, `/_config/backend/imap.listen_interface`, `/_config/backend/imap.hostname`, and `/_config/backend/enable_https` work over the API host on the VM. `daptin-cli` does not currently have a config command; tracking issue: `daptin/daptin-cli#36`.

Current recurring production resources include Cloud SQL and the Compute Engine VM. The old Cloud Run/load-balancer path still exists only as a temporary rollback path until DNS cutover is confirmed; delete it after public DNS points at `34.14.185.249` and public HTTPS/API checks pass.

DNS cutover records for Namecheap:

- `@` A `34.14.185.249`
- `www` A `34.14.185.249`
- `api` A `34.14.185.249`
- `mail` A `34.14.185.249`
- Domain SPF TXT: `v=spf1 ip4:34.14.185.249 -all`
- `mail` SPF TXT: `v=spf1 ip4:34.14.185.249 -all`
- `_dmarc` TXT: `v=DMARC1; p=none; adkim=s; aspf=r`
- `_dmarc.mail` TXT: `v=DMARC1; p=none; adkim=s; aspf=r`
- `d1._domainkey` and `d1._domainkey.mail` DKIM TXT records exist and publish Daptin certificate-derived public keys. OTP mail sends from `login@canaster.in`, so `d1._domainkey` is the alignment-critical DKIM record for sign-in mail.
- MX for the domain or `mail` subdomain as needed: `10 mail.canaster.in`
- Google Cloud public PTR is enabled on the VM access config: `34.14.185.249 -> mail.canaster.in`.

`.env.production` and `npm run dev:cloud` point `VITE_DAPTIN_ENDPOINT` at `https://api.canaster.in` for frontend builds and cloud-backed local development.


## Production Image

`deploy/daptin/Dockerfile` builds a thin Canaster Daptin image:

- Base image: `daptin/daptin@sha256:82f9bb30551403bf4cef03a35c8e75fa0a8160ac0af92bde3ac9b3197ea7f0e6`, a master image after Daptin commit `af6ff72b` that fixes `daptin/daptin#232`.
- Copies `daptin/schema_*.yaml` into `/opt/canaster/schema` for schema-managed email OTP auth actions
- Uses `/opt/canaster/entrypoint.sh`
- Reads `PORT` and `HTTPS_PORT`
- Requires `DAPTIN_DB_CONNECTION_STRING`
- Uses `DAPTIN_LOCAL_STORAGE_PATH=/data/storage`
- Runs Daptin with `-db_type postgres` and `-olric_env local`

## VM One-Time Setup

Do these once from a machine authenticated with `gcloud`. These commands create real cloud resources and are intentionally not run by CI.

```bash
export GCP_PROJECT=agent4-471206
export GCP_REGION=asia-south1
export GCP_ARTIFACT_REPOSITORY=canaster
export GCP_SQL_INSTANCE=canaster-postgres
export GCP_SQL_DATABASE=canaster
export GCP_SQL_USER=canaster
export GCP_STORAGE_BUCKET=canaster-daptin-storage
export GCP_VM_NAME=canaster-daptin-vm
export GCP_VM_ZONE=asia-south1-c
export GCP_VM_IP_NAME=canaster-vm-ip

gcloud config set project "$GCP_PROJECT"

gcloud services enable \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
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

gcloud compute addresses create "$GCP_VM_IP_NAME" \
  --region "$GCP_REGION"
```

After the SQL user password exists, authorize the VM static IP for Cloud SQL and store the VM connection string in Secret Manager:

```bash
export GCP_VM_IP="$(gcloud compute addresses describe "$GCP_VM_IP_NAME" --region "$GCP_REGION" --format='value(address)')"
export GCP_SQL_IP="$(gcloud sql instances describe "$GCP_SQL_INSTANCE" --format='value(ipAddresses[0].ipAddress)')"
export DAPTIN_DB_PASSWORD='<paste-password-created-above>'

gcloud sql instances patch "$GCP_SQL_INSTANCE" \
  --authorized-networks="$GCP_VM_IP/32"

printf 'host=%s port=5432 user=%s password=%s dbname=%s sslmode=disable' \
  "$GCP_SQL_IP" \
  "$GCP_SQL_USER" \
  "$DAPTIN_DB_PASSWORD" \
  "$GCP_SQL_DATABASE" |
gcloud secrets create canaster-daptin-vm-db-connection --data-file=-
```

Create firewall rules and the VM:

```bash
gcloud compute firewall-rules create canaster-vm-web \
  --network default \
  --direction INGRESS \
  --priority 1000 \
  --action ALLOW \
  --rules tcp:80,tcp:443 \
  --source-ranges 0.0.0.0/0 \
  --target-tags canaster-vm

gcloud compute firewall-rules create canaster-vm-smtp \
  --network default \
  --direction INGRESS \
  --priority 1000 \
  --action ALLOW \
  --rules tcp:25,tcp:465,tcp:587 \
  --source-ranges 0.0.0.0/0 \
  --target-tags canaster-vm

gcloud compute firewall-rules create canaster-vm-imaps \
  --network default \
  --direction INGRESS \
  --priority 1000 \
  --action ALLOW \
  --rules tcp:993 \
  --source-ranges 0.0.0.0/0 \
  --target-tags canaster-vm

gcloud compute firewall-rules create canaster-vm-iap-ssh \
  --network default \
  --direction INGRESS \
  --priority 1000 \
  --action ALLOW \
  --rules tcp:22 \
  --source-ranges 35.235.240.0/20 \
  --target-tags canaster-vm

export IMAGE="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$GCP_ARTIFACT_REPOSITORY/daptin:manual-vm-$(date -u +%Y%m%d%H%M%S)"

gcloud builds submit \
  --project "$GCP_PROJECT" \
  --config deploy/gcp/cloudbuild-daptin.yaml \
  --substitutions "_IMAGE=$IMAGE" \
  .

gcloud compute instances create "$GCP_VM_NAME" \
  --zone "$GCP_VM_ZONE" \
  --machine-type e2-small \
  --service-account "canaster-daptin-run@$GCP_PROJECT.iam.gserviceaccount.com" \
  --scopes cloud-platform \
  --address "$GCP_VM_IP" \
  --tags canaster-vm \
  --image-family debian-12 \
  --image-project debian-cloud \
  --boot-disk-size 30GB \
  --metadata enable-oslogin=TRUE,canaster-daptin-image="$IMAGE" \
  --metadata-from-file startup-script=deploy/gcp/vm-startup.sh
```

Set Daptin config through the Daptin config API after the VM answers HTTP, then restart Daptin:

```bash
export DAPTIN_ADMIN_TOKEN='<admin bearer token>'

curl -fsS -X POST \
  -H 'Host: api.canaster.in' \
  -H "Authorization: Bearer $DAPTIN_ADMIN_TOKEN" \
  -H 'Content-Type: text/plain' \
  --data-binary 'api.canaster.in' \
  "http://$GCP_VM_IP/_config/backend/hostname"

curl -fsS -X POST \
  -H 'Host: api.canaster.in' \
  -H "Authorization: Bearer $DAPTIN_ADMIN_TOKEN" \
  -H 'Content-Type: text/plain' \
  --data-binary 'true' \
  "http://$GCP_VM_IP/_config/backend/enable_https"

gcloud compute ssh "$GCP_VM_NAME" \
  --zone "$GCP_VM_ZONE" \
  --tunnel-through-iap \
  --command 'sudo docker restart canaster-daptin'
```

`daptin-cli` does not currently expose a first-class config command for this. Track that gap in `daptin/daptin-cli#36`; do not use direct `_config` table writes in CI.

## Historical Cloud Run Deploy (Superseded)

This block is retained for archaeology only. Current production deploys Daptin to `canaster-daptin-vm`.

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

## Historical Cloud Run Load Balancer Handoff (Superseded)

This block is retained for archaeology only. Current public DNS handoff uses the VM records in the `Production Backend` section.

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

The setup above creates the apex certificate resource `canaster-managed-cert` for `canaster.in` and `www.canaster.in`.

Public DNS is currently managed in Namecheap BasicDNS, not the GCP Cloud DNS zone. Keep these Namecheap records in place:

```text
@    A    8.232.13.111
www  A    8.232.13.111
*    A    8.232.13.111
```

If the deployment is later moved back to delegated Google Cloud DNS, switch the registrar nameservers fully. Do not try to keep Google Cloud DNS and Namecheap BasicDNS partially authoritative at the same time.

For `api.canaster.in`, Daptin issues the ACME certificate and GCP imports that certificate so the public load balancer can serve it:

```bash
gcloud compute ssl-certificates create canaster-api-self-cert \
  --global \
  --certificate=/path/to/api.canaster.in.cert.pem \
  --private-key=/path/to/api.canaster.in.key.pem

gcloud compute target-https-proxies update canaster-https-proxy \
  --global \
  --project "$GCP_PROJECT" \
  --ssl-certificates=canaster-api-self-cert,canaster-managed-cert \
  --global-ssl-certificates
```

`self-managed` is GCP's term for "uploaded certificate." The certificate material still comes from Daptin ACME, not from Google-managed issuance.

Historical DNS and TLS state as of 2026-06-16 20:25 IST:

- Public authoritative nameservers are `dns1.registrar-servers.com` and `dns2.registrar-servers.com`.
- `canaster.in`, `www.canaster.in`, `api.canaster.in`, and wildcard subdomains resolve to `8.232.13.111`.
- `canaster-managed-cert` is `ACTIVE` for `canaster.in` and `www.canaster.in`.
- `canaster-api-self-cert` is attached to `canaster-https-proxy` and serves `CN=api.canaster.in` with SAN `DNS:api.canaster.in`.
- `canaster-in` Cloud DNS zone still exists in GCP, but it is not publicly delegated.

Historical routing state as of 2026-06-16 20:25 IST:

- `https://canaster-vnlupz4kzq-el.a.run.app/` serves the Canway frontend.
- `https://canaster.in` and `https://www.canaster.in` now serve the Canway static site.
- `https://api.canaster.in` serves the Daptin admin/API surface.
- The intended public frontend/admin split is now active:
  - `canaster.in` and `www.canaster.in` -> Canway static site
  - `api.canaster.in` -> Daptin admin/API
- Do not create a static Daptin `site` row for `api.canaster.in` if that hostname should remain the admin/API surface.
- The broken Daptin `/_config` route still blocks dashboard-driven backend hostname configuration. Track that separately from TLS.

Verification loop:

```bash
dig +short NS canaster.in
dig +short A canaster.in
dig +short A api.canaster.in
gcloud compute ssl-certificates describe canaster-managed-cert \
  --global \
  --project agent4-471206 \
  --format='json(managed.status,managed.domainStatus)'
gcloud compute ssl-certificates describe canaster-api-self-cert \
  --global \
  --project agent4-471206 \
  --format='json(type,subjectAlternativeNames,expireTime)'
openssl s_client -connect api.canaster.in:443 -servername api.canaster.in </dev/null 2>/dev/null | \
  openssl x509 -noout -subject -issuer -ext subjectAltName
curl -I https://canaster.in
curl -I https://api.canaster.in
```

To run the frontend locally against the deployed backend, use:

```bash
npm run dev:cloud
```

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
- Local verification used a short-lived `access_token`; production should use VM service account metadata credentials with rclone `env_auth=true`.

Permanent local smoke behavior:

- `npm run daptin:smoke:local` uses the existing CLI token in `.tmp/daptin/local-site-cli.yaml`.
- It does not sign up a new user against the permanent local Daptin server.
- It verifies built-in `document` JSON blob create/update/read, private guest `403`, public guest `200`, and snapshot decode.
- On 2026-06-16 14:52 IST the permanent local create permission was `561441`; the smoke does not depend on a specific create default and instead verifies the explicit private/public permission patches.

### Historical Production Site/GCS Bootstrap Status

Historical Cloud Run state as of 2026-06-16 20:25 IST:

- The Canaster frontend build has been uploaded through Daptin to Google Cloud Storage.
- Daptin served the uploaded static site from GCS for the two direct Cloud Run hostnames and for the public frontend hostnames `canaster.in` and `www.canaster.in`.
- The backend API remains available under Daptin's normal `/api/...` paths.
- The active public Cloud Run hostnames were `canaster-vnlupz4kzq-el.a.run.app` and `canaster-740552849684.asia-south1.run.app`.

Production Daptin GCS store:

```text
cloud_store.name: canaster-site
cloud_store.store_type: google cloud storage
cloud_store.store_provider: Google
cloud_store.root_path: canaster-site:canaster-daptin-storage
cloud_store.credential_name: canaster-site
credential style: rclone config keys
production credential key: env_auth=true
historical auth source: Cloud Run service account metadata
bucket: gs://canaster-daptin-storage
```

Production Daptin mail GCS store:

```text
cloud_store.name: canaster-mail
cloud_store.store_type: google cloud storage
cloud_store.store_provider: Google
cloud_store.root_path: canaster-mail:canaster-daptin-storage
cloud_store.credential_name: canaster-site
credential style: rclone config keys
production credential key: env_auth=true
bucket: gs://canaster-daptin-storage
schema columns:
  mail.mail -> canaster-mail/mail-messages
  outbox.mail -> canaster-mail/outbox-messages
```

Production Daptin sites:

```text
hostname: canaster-vnlupz4kzq-el.a.run.app
path: /canaster
cloud_store: canaster-site

hostname: canaster-740552849684.asia-south1.run.app
path: /canaster
cloud_store: canaster-site

hostname: canaster.in
path: /canaster
cloud_store: canaster-site

hostname: www.canaster.in
path: /canaster
cloud_store: canaster-site
```

There is intentionally no static `site` row for `api.canaster.in`.

Important Daptin routing detail:

- Do not put multiple hostnames in one comma-separated `site.hostname`.
- Daptin splits comma-separated hostnames into `SiteMap`, but `HandlerMap` is keyed by the full `site.Hostname` string.
- For reliable hostname routing, create one `site` row per hostname.
- Daptin loads site rows at startup, so adding or changing public hostnames requires a controlled restart before the new routing can take effect.

Production verification commands:

```bash
daptin-cli storage upload canaster-site:/canaster ./dist --recursive
gcloud storage ls gs://canaster-daptin-storage/canaster/index.html
gcloud compute ssh canaster-daptin-vm \
  --zone asia-south1-c \
  --tunnel-through-iap \
  --command 'sudo docker restart canaster-daptin'
curl --resolve canaster.in:443:34.14.185.249 -fsS https://canaster.in/ | rg '<title>Canway</title>'
curl --noproxy '*' -fsS https://canaster.in/ | rg '<title>Canway</title>'
curl --noproxy '*' -fsS https://api.canaster.in/ | rg '<title>Daptin Admin</title>'
curl --noproxy '*' -fsS 'https://api.canaster.in/api/world?page%5Bsize%5D=1' >/dev/null
```

Observed result:

```text
https://canaster.in/ serves <title>Canway</title>
https://api.canaster.in/ serves <title>Daptin Admin</title>
/api/world?page%5Bsize%5D=1 returns HTTP 200
```

## Daptin Site Bootstrap

After the first Daptin deploy is healthy, bootstrap the admin account, GCS-backed `cloud_store`, and hostname-specific `site` rows through Daptin itself.

```bash
export DAPTIN_ENDPOINT="http://$GCP_VM_IP"
export DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml
export DAPTIN_ADMIN_EMAIL=admin@canaster.in
export DAPTIN_ADMIN_PASSWORD='<admin-password>'

daptin-cli context add prod "$DAPTIN_ENDPOINT"
daptin-cli context set prod
daptin-cli execute user_account signup "email=$DAPTIN_ADMIN_EMAIL" "name=Canaster Admin" "password=$DAPTIN_ADMIN_PASSWORD" "passwordConfirm=$DAPTIN_ADMIN_PASSWORD"
daptin-cli execute user_account signin "email=$DAPTIN_ADMIN_EMAIL" "password=$DAPTIN_ADMIN_PASSWORD"
daptin-cli execute world become_an_administrator
daptin-cli storage upload canaster-site:/canaster ./dist --recursive
daptin-cli create site name=canaster-apex hostname=canaster.in path=canaster enable=true site_type=static
daptin-cli create site name=canaster-www hostname=www.canaster.in path=canaster enable=true site_type=static
export CANASTER_SITE_STORE_REF="$(daptin-cli --output json list cloud_store --filter name=canaster-site --columns reference_id --page-size 1 | jq -r '.[0].reference_id // .[0].attributes.reference_id')"
for CANASTER_SITE_NAME in canaster-apex canaster-www; do
  CANASTER_SITE_REF="$(daptin-cli --output json list site --filter name="$CANASTER_SITE_NAME" --columns reference_id --page-size 1 | jq -r '.[0].reference_id // .[0].attributes.reference_id')"
  daptin-cli relate site "$CANASTER_SITE_REF" cloud_store_id "$CANASTER_SITE_STORE_REF"
done
```

Use the `Production Daptin GCS store` field values above when creating `canaster-site`. The production store is Google Cloud Storage-backed, not local disk-backed.

Do not comma-join hostnames into one `site.hostname`, and do not create a static site row for `api.canaster.in` if that hostname should remain the Daptin admin/API surface.

After adding or changing production `site` rows, restart Daptin in a controlled deploy window so the host switch reloads the new hostname routing. This restart has already been performed for `canaster.in` and `www.canaster.in`.

This is Daptin data/bootstrap work, not a Canaster app-state schema addition.

## Production Admin State

Current interim state as of 2026-06-18:

- The retained bootstrap administrator account is `admin@canaster.in`.
- The account credentials are recorded in `production-admin-credentials.md`.
- `world.become_an_administrator` has already been consumed by the retained bootstrap admin account; later calls from another user return `403`.
- Password `signin`, `signup`, `reset-password`, and `reset-password-verify` are locked at permission `2085120`; password auth/reset are not the intended frontend auth path.
- `world.permission(action)=561440` and `world.permission(user_account)=561440`, which grants guest Execute only, without guest Peek/Read/Create/Update/Delete. This lets Daptin dispatch public OTP actions without allowing guest CRUD/listing on `user_account`.
- Sensitive Daptin tables such as `outbox`, `cloud_store`, `credential`, `certificate`, `user_otp_account`, `mail_account`, `mail_box`, `mail_server`, and `site` are locked at `world.permission=561408`, so guest list/create/update/delete requests return `403`.
- Public browser auth uses `request_canaster_email_otp` and `verify_canaster_email_otp`, both schema-managed on `user_account` with action permission `32` (`GuestExecute`). The request action creates the user account before OTP generation when the email is new, makes that new account row self-owned with owner `Refer` permission for Daptin's `user_otp_account.otp_of_account` foreign key, then switches the action context to that user before executing Daptin's built-in `otp.generate`.
- `verify_canaster_email_otp` is the signup completion point. After `otp.login.verify` succeeds, it creates the user's missing `mail_account` row and default mailbox folders (`INBOX`, `Draft`, `Sent`, `Archive`, `Trash`, `Spam`) using normal `mail_account.user_account_id`, `mail_account.mail_server_id`, `mail_box.user_account_id`, and `mail_box.mail_account_id` foreign-key columns. Do not create or patch generated join-table rows for this flow.
- `mail_account` and `mail_box` use `DefaultPermission: 569633` (`Owner: Read, Execute, Refer`) so rows created by OTP verification can later be used as foreign-key targets for the same user. Do not put row permissions in the mail-table action POST payloads; Daptin create uses the table model default permission.
- The generated mailbox password stays server-side, stays under Daptin's bcrypt input limit, and is not returned by the verify action. If users need direct IMAP/SMTP client credentials, add a separate authenticated mailbox-password reset action instead of exposing the generated value during signup.
- Inbound SMTP saves `mail` rows as the recipient user. Production must therefore keep `world.permission(mail)=561408` and grant the built-in `users` usergroup table-level `mail` access through a `usergroup(users).world_id -> mail` relation with permission `638976` (`Group: Peek, Read, Create, Execute`). The generated `world_world_id_has_usergroup_usergroup_id` relation table uses `DefaultPermission: 638976`; repair existing relation rows that predate the default. Do not use `GuestCreate` on `mail`.
- Updating Daptin action permissions does not require a Daptin restart.
- `artpar@gmail.com` exists in production as a normal user account; the retained bootstrap administrator account is still `admin@canaster.in`.
- `admin@canaster.in` remains related to both `users` and `administrators`.

Verified with:

```bash
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli related user_account "$ADMIN_USER_REF" usergroup_id
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list action --filter action_name=signin --page-size 1
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list action --filter action_name=signup --page-size 1
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list action --filter action_name=reset-password --page-size 1
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list action --filter action_name=reset-password-verify --page-size 1
```

After the email OTP schema is deployed, also verify:

```bash
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list action --filter action_name=request_canaster_email_otp --page-size 1
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list action --filter action_name=verify_canaster_email_otp --page-size 1
```

Public auth verification after deployment:

```bash
curl -sS -o /tmp/canaster-otp-bad.json -w '%{http_code}\n' \
  -X POST 'https://api.canaster.in/action/user_account/request_canaster_email_otp' \
  -H 'Content-Type: application/json' \
  --data '{"attributes":{"email":"bad"}}'
```

Expected result is `400`, not `403`; that proves the public OTP request action is executable and validation is reached. A successful real-user OTP journey also requires Daptin SMTP to be configured for `mail.canaster.in`.

Production OTP mail uses Daptin's `mail.send` performer, not `aws.mail.send`. Daptin queues the email in `outbox`, signs it when `mail_server_hostname` is present, and Canaster sets `send_immediately: true` so Daptin reloads the newly created cloud-store-backed outbox row and attempts delivery before returning. The scheduled `outbox.process` task still handles retries and any remaining pending rows. The Canaster OTP action sends from `login@canaster.in` with `mail_server_hostname=mail.canaster.in`, so the visible sender is on the main domain while the SMTP listener, MX target, PTR, and server identity remain `mail.canaster.in`. Daptin signs outgoing mail with the `From` domain, so OTP delivery requires a `certificate.hostname=canaster.in` row with a private key and the matching `d1._domainkey.canaster.in` DNS record.

Required Daptin mail rows and actions:

```bash
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli create mail_server hostname=mail.canaster.in is_enabled=true listen_interface=0.0.0.0:465 max_size=10000 max_clients=20 xclient_on=false always_on_tls=true authentication_required=true
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli execute mail_server sync_mail_servers
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list certificate --filter hostname=canaster.in --page-size 1
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list certificate --filter hostname=mail.canaster.in --page-size 1
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli execute outbox process_outbox
```

After schema deploy, verify the mail table access state:

```bash
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json list world --filter table_name=mail --page-size 1
DAPTIN_CLI_CONFIG=.tmp/daptin/prod-cli.yaml daptin-cli --output json related usergroup "$USERS_GROUP_REF" world_id
```

Current production Daptin SMTP/IMAP state as of 2026-06-19:

- `mail_server.hostname=mail.canaster.in`, reference `019ed9f2-96b5-7131-af6f-b304ee8ff581`, enabled on `0.0.0.0:465`.
- Additional `mail.canaster.in` SMTP rows are enabled on `0.0.0.0:25` and `0.0.0.0:587`.
- `certificate.hostname=canaster.in`, id `9`, issuer `acme`, has private key, generated at `2026-06-18 09:52:46`; this is the DKIM signing identity for `login@canaster.in`.
- `certificate.hostname=mail.canaster.in`, reference `019ed9f3-17a2-72a9-89bd-2696b295a52f`, issuer `acme`.
- `/_config/backend/hostname=api.canaster.in`.
- `/_config/backend/imap.enabled=true`.
- `/_config/backend/imap.listen_interface=:993`.
- `/_config/backend/imap.hostname=imap.canaster.in`.
- `certificate.hostname=imap.canaster.in`, reference `019edc81-f2fc-7adf-bfd9-8b9257fdf807`, issuer `acme`.
- Daptin `v0.12.21` keeps the independent `imap.hostname` setting from `v0.12.20`, so IMAPS can use `imap.canaster.in` while HTTPS API keeps using `api.canaster.in`.
- Daptin `v0.12.21` fixes `daptin/daptin#223` so IMAPS serves the full ACME certificate chain from `certificate_pem` plus `root_certificate` without a manual certificate row patch.
- Daptin `v0.12.21` fixes `daptin/daptin#224` so schema import applies `IsForeignKey=true` and `ForeignKeyData` for the cloud-store-backed `mail.mail` and `outbox.mail` columns without a manual world row patch.
- Daptin `v0.12.22` fixes `daptin/daptin#225` so schema import preserves deployer-authored generated join table metadata. Canaster declares `world_world_id_has_usergroup_usergroup_id.DefaultPermission=638976` in schema and verifies relation rows through normal relation APIs.
- Daptin `v0.12.23` fixes `daptin/daptin#228`: `process_outbox` now sends fresh message readers across MX retry attempts, so Gmail no longer receives empty SMTP DATA and rejects with missing `From`.
- Daptin `v0.12.25` fixes `daptin/daptin#229`: `mail.send` supports `send_immediately: true` for cloud-store-backed `outbox.mail` by committing the outbox row, reloading it with the mail file hydrated, attempting SMTP delivery, and leaving retry metadata if the immediate attempt fails.
- The ignored local file `.tmp/daptin/prod-mail-login.env` stores the current `login@mail.canaster.in` mailbox credential for operational SMTP AUTH and IMAP smoke tests. OTP mail now uses the visible sender `login@canaster.in`; the mailbox credential can remain a server-auth operational account unless direct mailbox login for `login@canaster.in` is needed. Do not commit it.
- `sync_mail_servers` and `process_outbox` both execute successfully as the production admin.

DNS records to create after the Daptin certificate row exists:

- `canaster.in`: TXT SPF record `v=spf1 ip4:34.14.185.249 -all`.
- `d1._domainkey.canaster.in`: TXT `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuEDAP9hFXxLpTYDODdNwLpkvDnPyvE9U/NTZ+mR2sppgHTRgbOSDbaV1seKHc2dy6u7pKEccjvQByOisIFdHF/g4lBi14F2V9Qoew/lqLa0uT99sar+9EYqa5FkDPAIAE0F4GqQ1VTnNJxFWL492g1DITK0lG1/WJSTRN1s72tUFw9uZtEm+kVdXrW9igjlj+4jT8e4UGr3RHCE0rKVUQKjYL1rp8zl301hfWD6/Ig1c1FHh/x81WAuzijjaZbDd+OgDBpdj8CyjP0lC/w2V8bPss0+1eHvPoZKEo1p8jK4Nh6FyQTFDMndlR1Du0ElznT1HuU0a2Z8rcptPjBPxnQIDAQAB`
- `_dmarc.canaster.in`: TXT `v=DMARC1; p=none; adkim=s; aspf=r` while delivery is being verified.
- `canaster.in`: MX `10 mail.canaster.in`.
- `mail.canaster.in`: A `34.14.185.249`.
- `d1._domainkey.mail.canaster.in`: TXT `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmbAxB5g2/ybmiBbuwPJelJIkf2WfcVJqZAl9QJTRwDohKjAzwygGIuDdvuKLud+2wZcoVr57I4gUUHWhT9K/Cn6PA6BPn7HvcCQR5VI0KHo5CFeRMs8IWdjoONl3WXbTdsxq7ntpdb2vCvXnYMR+JZ2kViz7OnkHYNwQRJ6akRAPZ5DbIotr6NV12sJXTiLGildN/T54NnjsF/1QZW8vr2wbeqkqYvwr5rYDTiihqTqtsuHCCJ7WwszA2fa7DlwJZ9/NMYaV4zYbFXopKMHAaFYO3TUqPs+KggU7krTuuAalauFNbEUBMlS4meFcIHi1ei8xLmmigsPqJhUu7kYQ/wIDAQAB`
- `mail.canaster.in`: TXT SPF record `v=spf1 ip4:34.14.185.249 -all`.
- `_dmarc.mail.canaster.in`: TXT `v=DMARC1; p=none; adkim=s; aspf=r` for initial monitoring while delivery is being verified.

`mail.canaster.in`, `imap.canaster.in`, and wildcard subdomains should resolve to the VM IP `34.14.185.249` after DNS cutover. VM outbound SMTP delivery has been verified from `canaster-daptin-vm`: TCP 25 to `gmail-smtp-in.l.google.com` succeeds, and TCP 465 to `smtp.gmail.com` succeeds. Public SMTP is verified on `25`, `465`, and `587`; public IMAPS is verified on `993`. Forward and reverse DNS are aligned: `mail.canaster.in A -> 34.14.185.249` and `34.14.185.249 PTR -> mail.canaster.in`.

Final production mail smoke on 2026-06-19:

- `openssl s_client -starttls smtp -connect mail.canaster.in:25 -servername mail.canaster.in -verify_return_error` returned a trusted three-certificate chain.
- `openssl s_client -connect imap.canaster.in:993 -servername imap.canaster.in -verify_return_error` returned a trusted three-certificate chain.
- IMAP `LOGIN`, `SELECT INBOX`, and `SEARCH ALL` succeeded for `login@mail.canaster.in`.
- SMTP AUTH LOGIN over STARTTLS on `mail.canaster.in:587` succeeded for `login@mail.canaster.in`.
- Fresh inbound SMTP to `login@mail.canaster.in` created a `mail` row with `mail` as a cloud-store file array.
- Fresh `request_canaster_email_otp` plus `outbox.process_outbox` created a cloud-store outbox file array, marked the outbox row `sent=true`, and delivered the OTP into `mail` as a cloud-store file array.

Production image panel upload RCA on 2026-06-24:

- Symptom: signed-in image panel upload returned permission denied.
- Cause: the `asset` table existed, but production did not yet have the `assets` cloud store or the `users -> asset` table-access relation. The schema smoke covered privileged/isolated asset creation, not the normal signed-in production user path.
- Fix: created the GCS-backed `assets` cloud store, set `world.permission(asset)=741632`, added the `users -> asset` relation with permission `770048`, restarted Daptin so the cloud store was loaded, and verified with real OTP sessions that asset create, private permission patch, owner JSON:API read, and owner artifact download succeed.
- Security note: on 2026-06-24, production testing showed Daptin served raw file bytes from `/asset/asset/<ref>/file` even when JSON:API row access returned `403` to guests and non-owners. This is tracked as `daptin/daptin#232` and fixed in Daptin commit `af6ff72b`. Canaster should use the artifact route through authenticated `fetch`, not direct `<img src>`, so the bearer token is sent and Daptin can enforce row permissions.

Final production OTP smoke on 2026-06-24 after `daptin/daptin:v0.12.25`:

- Canaster image `asia-south1-docker.pkg.dev/agent4-471206/canaster/daptin:9f76f9ea947a8de04d7a6c214a9bb79999091de4` was deployed by GitHub Actions run `28090383127`.
- Fresh `request_canaster_email_otp` to `artpar@gmail.com` generated the mail at `09:59:12 UTC`.
- Daptin immediate delivery sent outbox row `31` at `09:59:14 UTC`.
- The action POST returned `200` at `09:59:14 UTC`, after the immediate delivery attempt completed.
- The recipient confirmed the OTP arrived in Gmail.
- There was no `Failed to read outbox mail` cloud-store hydration error and no `From header is missing` Gmail rejection.

## CI/CD

CI (`.github/workflows/ci.yml`) runs:

- `npm ci`
- TypeScript and Vite build
- Daptin schema smoke against the real pinned Daptin base image and Postgres 16

Production deploy (`.github/workflows/deploy-daptin.yml`) builds the Daptin image, builds/uploads the frontend, deploys the image to `canaster-daptin-vm` over IAP SSH, and smokes the VM runtime.

Required GitHub variables:

- `GCP_DEPLOY_ENABLED=true`
- `GCP_PROJECT=agent4-471206`
- `GCP_REGION=asia-south1`
- `GCP_ARTIFACT_REPOSITORY=canaster`
- `GCP_VM_NAME=canaster-daptin-vm`
- `GCP_VM_ZONE=asia-south1-c`
- `GCP_STORAGE_BUCKET=canaster-daptin-storage`
- `DAPTIN_SITE_PATH=/canaster`

Currently set GitHub repository variables as of 2026-06-18 15:35 IST include:

- `GCP_VM_NAME=canaster-daptin-vm`
- `GCP_VM_ZONE=asia-south1-c`

Required GitHub secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `DAPTIN_ADMIN_EMAIL`
- `DAPTIN_ADMIN_PASSWORD`

Required Google Secret Manager secret for VM runtime:

- `canaster-daptin-vm-db-connection`

## Frontend SDK Boundary

Install and use `daptin-client@0.7.12`.

The frontend adapter must expose only this Canaster-facing API:

- `requestEmailOtp`, `verifyEmailOtp`, `signOut`
- `listDocuments`, `createDocument`, `loadDocument`
- `saveDocument`, `makeDocumentPrivate`, `makeDocumentPublic`
- `deleteDocument`

The adapter must not expose Daptin join table names, custom auth abstractions, sharing, or collaboration for MVP.

## Source References

- Daptin schema files are loaded from `schema_*.yaml` and can use `DAPTIN_SCHEMA_FOLDER`.
- Daptin `upload_system_schema` exists but is not the deployment path for production schema creation.
- The VM startup script installs Docker, disables Debian `exim4`, and runs one Daptin container.
- The VM runtime reads `DAPTIN_DB_CONNECTION_STRING` from Secret Manager secret `canaster-daptin-vm-db-connection`.
- The VM maps public `80 -> 8080`, `443 -> 6443`, `25 -> 25`, `465 -> 465`, and `587 -> 587` into the Daptin container.
- Daptin starts HTTPS only after `/_config/backend/enable_https=true` and a backend `hostname` with certificate material exist.
- Use Daptin `/_config/backend/<key>` for config values until `daptin-cli` grows first-class config commands.
