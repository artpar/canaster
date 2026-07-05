# Local Daptin OTP Login

This note is for local development when an agent needs to complete Canaster OTP login through Daptin without browser UI testing.

Use this only for a local Daptin database after the user has explicitly allowed direct SQL for OTP extraction. The normal project rule is to use `daptin-cli` for Daptin backend operations. SQL here is an exception because `daptin-cli` does not expose `_config` as an entity and does not return encrypted `user_otp_account.otp_secret`.

## What This Proves

This flow proves the running local Daptin action can verify an OTP and issue a session token for the target user. It does not prove browser UI behavior or human acceptance.

State the runtime being used before running the flow. For the current visibility-matrix local instance, the relevant containers are:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

Expected current local runtime:

- Daptin API: `http://localhost:7537`
- Daptin container: `canaster-visibility-matrix-e2e-daptin-1`
- Postgres container: `canaster-visibility-matrix-e2e-postgres-1`
- Postgres database/user: `canaster` / `canaster`

Do not use the old `localhost:6336` instance for this flow unless the user explicitly says that is the target runtime.

## Why SQL Is Needed

Runtime evidence from the local 7537 instance:

- `daptin-cli describe table _config` returns `entity "_config" not found`.
- SQL shows `_config` exists in Postgres.
- `daptin-cli get user_otp_account <ref>` omits `otp_secret`.
- SQL shows `user_otp_account.otp_secret` exists and is encrypted.

Daptin source evidence from `server/resource/encryption_decryption.go`:

- encrypted fields use AES-CFB;
- the AES key is the raw bytes of `_config.value` for `name='encryption.secret'` and `configtype='backend'`;
- ciphertext is encoded with Go `base64.URLEncoding`;
- the first AES block is the IV.

Daptin source evidence from `server/actions/action_otp_generate.go` and `server/actions/action_otp_login_verify.go`:

- OTP secret generation uses TOTP;
- period is `300` seconds;
- digits are `4`;
- algorithm is SHA1;
- verification allows skew `1`.

## Generate The OTP

Set the target email first:

```bash
EMAIL='person@example.local'
```

Read the encrypted OTP secret and Daptin encryption secret from local Postgres:

```bash
read -r ENCRYPTION_SECRET OTP_SECRET < <(
  docker exec canaster-visibility-matrix-e2e-postgres-1 \
    psql -U canaster -d canaster -At -F ' ' -c "
      select
        (select value from _config where name = 'encryption.secret' and configtype = 'backend' limit 1),
        o.otp_secret
      from user_account u
      join user_otp_account o on o.user_account_id = u.id
      where u.email = '$EMAIL'
      limit 1;
    "
)
```

Generate the current Daptin OTP:

```bash
OTP="$(
  ENCRYPTION_SECRET="$ENCRYPTION_SECRET" OTP_SECRET="$OTP_SECRET" python3 - <<'PY'
import base64
import hashlib
import hmac
import os
import struct
import subprocess
import time

key_text = os.environ["ENCRYPTION_SECRET"]
crypto_text = os.environ["OTP_SECRET"]

raw = base64.urlsafe_b64decode(crypto_text)
iv = raw[:16]
ciphertext = raw[16:]

secret = subprocess.run(
    [
        "openssl",
        "enc",
        "-aes-256-cfb",
        "-d",
        "-K",
        key_text.encode().hex(),
        "-iv",
        iv.hex(),
        "-nopad",
    ],
    input=ciphertext,
    stdout=subprocess.PIPE,
    check=True,
).stdout.decode()

secret_bytes = base64.b32decode(secret, casefold=True)
counter = int(time.time()) // 300
digest = hmac.new(secret_bytes, struct.pack(">Q", counter), hashlib.sha1).digest()
offset = digest[-1] & 0x0F
code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 10000
print(f"{code:04d}")
PY
)"
printf 'OTP=%s\n' "$OTP"
```

Submit the OTP through Daptin, not SQL:

```bash
daptin-cli execute user_account verify_canaster_email_otp email="$EMAIL" otp="$OTP"
```

If it succeeds, `daptin-cli` prints `Authenticated successfully`.

## Important Follow-Up

`verify_canaster_email_otp` returns a user session token. `daptin-cli` stores that token in the active context, so the active context becomes the verified user after success.

If the next checks require admin visibility, sign the local admin back in:

```bash
daptin-cli execute user_account signin \
  email=visibility-repeat-admin@canaster.local \
  password=CanasterSmoke1234
```

Then verify runtime state with the intended auth context:

```bash
daptin-cli --output json --no-truncate get user_otp_account "$OTP_REF"
daptin-cli --output json --no-truncate list mail_account --page-size 20
daptin-cli --output json --no-truncate list mail_box --page-size 50
```

## Common Failure Modes

- If `daptin-cli` says `_config` does not exist, that only proves the CLI/API entity surface does not expose `_config`; it does not prove the SQL table is absent.
- If `daptin-cli get user_otp_account` omits `otp_secret`, that only proves the encrypted field is not exposed through that API response.
- If `verify_canaster_email_otp` succeeds, the CLI auth context changes to the verified user. A following `403 TableAccessPermissionChecker` may be caused by using the new normal-user token for an admin-only check.
- If the OTP fails, regenerate it immediately. Daptin uses a 300-second period.
- Do not treat this flow as browser testing. Human testing still owns visible UI and end-user acceptance.
