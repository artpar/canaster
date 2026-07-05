# Canaster Mail Repair Journey

This note records the hard path to working Canaster mail in July 2026. Its purpose is operational memory: future work should not repeat the same lifecycle, Daptin, permission, and evidence-boundary mistakes.

## Result

Production mail send and receive worked after commit `128c823` (`Fix Canaster mail send flow`) was deployed by GitHub Actions run `28740115774` on 2026-07-05.

Evidence:

- CI run `28740115770` passed.
- Deploy run `28740115774` completed successfully.
- The user reported on 2026-07-05 that both sending and receiving mail to Gmail worked from production.

What that proves:

- Production human acceptance covered the visible send and receive behavior used by the user.
- The deployed source and production Daptin runtime were good enough for that path.

What that does not prove:

- It does not prove every mail permission scenario.
- It does not prove browser UI behavior for accounts other than the user-tested account.
- It does not prove that the earlier conditioned Daptin outfield behavior was fully explained.

## What Went Wrong

The failure was not one bug. It was a sequence of avoidable SDLC mistakes around an existing Daptin-backed system.

### Source Was Confused With Runtime

Several statements treated checked-in schema or generated schema as if they proved the running backend behavior. That was wrong.

The real layers were:

- source schema under `daptin/`;
- generated local schema under `.tmp/daptin/local-schema/`;
- the running local Daptin process and database;
- production Daptin process and database;
- frontend static checks;
- browser UI behavior;
- human end-to-end acceptance.

A source action existing did not prove the generated local schema had been refreshed. A generated action existing did not prove the running Daptin process had imported it. A running local action did not prove production had it.

### Daptin Success Was Misread

The `send_canaster_mail` action could return HTTP 200 with an empty response body (`[]`). That was initially treated too loosely.

What the evidence later showed:

- A real send path produced an explicit Daptin `client.notify` success message.
- Empty `[]` meant no success outfield had executed.
- `daptin-cli` could present a command as successful even when the action response body was `[]`.
- Daptin's action executor can skip outfields when their conditions do not pass or cannot be evaluated.

The frontend fix was to require an explicit success notification through `daptinActionSuccessMessage`. HTTP 200 alone is not a mail-send success signal.

### Ownership Was Duplicated In The Wrong Place

The send action originally tried to restate ownership in action JavaScript conditions. That duplicated Daptin's existing subject row access model and made the action brittle.

The fixed shape is:

- the browser calls `send_canaster_mail` on a specific `mail_account` subject;
- Daptin must load that subject for the authenticated user;
- Daptin row/object access blocks a normal user from executing the action against another user's mail account;
- once the subject is loaded, the send outfields run without an extra duplicate ownership condition.

Local evidence from the authenticated mail runtime showed wrong-owner execution failed with `403 ObjectAccessPermissionChecker`. That is the important authorization check.

### Mail Account Provisioning Was Put In The Wrong User Moment

Mailbox setup was initially treated as something the UI might need to trigger. That was wrong for Canaster.

The corrected product/backend shape is:

- the first successful OTP verification provisions the mail account and default mailboxes;
- the browser should not show a "Set up mail" recovery path as normal UX;
- the signed-in user may later choose a Canaster mail username through `set_canaster_mail_username`;
- username availability and minimum length belong in that action;
- mailbox rows use normal Daptin entity foreign-key columns, not hand-written generated join table manipulation.

### Compose Runtime Confusion Burned Time

The persistent local Canaster Daptin instance is `http://canaster.local:6336`. Temporary runtimes used during authz/mail debugging must not be reported as if they prove the persistent local instance.

During the repair, full authenticated local mail e2e evidence came from a temporary mail runtime on `http://localhost:7537`, not the persistent `6336` instance. The persistent instance was later restarted and loaded schema, but it did not have a usable authenticated CLI context for the same e2e claim.

Correct reporting must say the exact endpoint and auth context.

### Local MX Lookup Was Missed

After the send action created outbox rows, local delivery still failed because Daptin's outbox processor performed MX lookup and the Daptin container used Docker's `127.0.0.11` resolver.

Evidence:

- outbox rows were created;
- delivery logs showed MX lookup failure for the local mail domain;
- mounting `daptin/local-dns/resolv.conf` into the Daptin container made Daptin use the CoreDNS sidecar at `127.0.0.1`;
- after that, Daptin logs showed the SMTP send path and the recipient `mail` row appeared.

Important rule: `/etc/hosts` is not enough for local mail delivery, because MX lookup does not come from hosts-file name resolution.

## Final Shape To Preserve

Backend:

- OTP verification provisions one `mail_account` and default `mail_box` rows.
- `set_canaster_mail_username` lets a signed-in user choose an available local part of at least five valid characters.
- `send_canaster_mail` sends from the authenticated subject `mail_account`.
- `send_canaster_mail` relies on Daptin subject object access instead of duplicate ownership conditions.
- Mail row defaults stay owner-scoped with `DefaultPermission: 12672`.
- Table reachability for signed-in users is through Daptin `AccessGroups`, not group-visible row defaults.
- Local Daptin mail delivery needs the Compose DNS sidecar plus the resolver mount.

Frontend:

- `mailNode` is list-only.
- Compose/send UI is outside canvas rendering.
- Daptin list queries go through the shared Daptin client wrapper.
- Send success requires an explicit Daptin success notification, not only HTTP 200.

Production:

- The deployed image must include the source schema changes.
- Production Daptin must import those schema changes on startup.
- Human acceptance remains the final visible send/receive check.

## Verification Matrix From The Repair

| Layer | Evidence from 2026-07-05 | Status |
| --- | --- | --- |
| Source schema | Commit `128c823` changed `daptin/schema_canaster_mail.yaml` and `daptin/schema_canaster_auth.yaml` | Proven |
| Generated local schema | `npm run daptin:local:schema` refreshed `.tmp/daptin/local-schema/` during the repair | Proven for that local run |
| Authenticated local mail runtime | Temporary runtime at `http://localhost:7537` verified username setup, owner send, wrong-owner denial, outbox send, and recipient mail row | Proven for that runtime |
| Persistent local Daptin | `http://canaster.local:6336` was restarted and loaded schema, but lacked the same usable authenticated CLI context for full e2e proof | Partially proven |
| Frontend static checks | `npm run verify:fast` passed | Proven for static checks only |
| Production deploy | GitHub Actions deploy run `28740115774` succeeded | Proven |
| Production human acceptance | User confirmed Gmail send and receive worked | Proven for that user path |

## Unknowns Not To Invent

The exact runtime reason why the earlier subject/reference/username-conditioned `send_canaster_mail` outfields returned `[]` was not proven.

Known facts:

- the conditioned action returned `[]`;
- Daptin can skip outfields whose conditions fail or error;
- removing the redundant conditions allowed the send outfields to execute after Daptin loaded the subject;
- wrong-owner execution was still blocked by Daptin object access.

Do not rewrite this as "Daptin cannot stringify references" or any other single-cause explanation unless a future investigation proves that exact mechanism from source or runtime evidence.

## Rules For Future Mail Work

- Do not use direct SQL, raw HTTP, inline Node, browser fetch snippets, or one-off probes against Daptin. Use `daptin-cli` for non-UI backend work.
- Do not claim user-path success from admin or privileged evidence.
- Do not claim runtime state from source or generated schema.
- Do not add ownership resolver code when Daptin subject object access already answers the authorization question.
- Do not add UI setup flows for data that should be created at OTP verification.
- Do not treat HTTP 200 as action success unless the action contract has a success payload and the frontend checks it.
- Do not report a temporary Daptin runtime as the persistent local Canaster instance.
- Do not ask human testing to verify backend action availability, row permissions, schema import, or mail transport logs. Human testing is for visible UI and end behavior.

## Related Files

- `daptin/schema_canaster_auth.yaml`
- `daptin/schema_canaster_mail.yaml`
- `docker-compose.daptin.yml`
- `daptin/local-dns/resolv.conf`
- `src/infra/daptin/mail.ts`
- `src/infra/daptin/daptinActionFailureMessage.ts`
- `src/ui/canvas/nodeTypes/mailNode.ts`
- `src/ui/MailComposerPanel.tsx`
- `src/ui/workspaceMailService.ts`
- `docs/daptin/mail-permissions-row-privacy-wiki-article.md`
