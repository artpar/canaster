# Mail Table Permissions: Table Access Without Row Leaks

This guide shows how to configure Daptin mail tables so authenticated users can use mail features without being able to read each other's mail accounts, mailboxes, or messages.

The key rule is:

> Use usergroup table access for reachability. Use row permissions for privacy.

Do not solve "signed-in users need to use this table" by giving every row group read permission.

## Permission Layers

Daptin checks more than one layer:

- `world.permission` controls the base table/type surface.
- A `usergroup -> world` relation, often created from `Tables[].AccessGroups`, grants table-level access to signed-in groups.
- `world_schema_json.DefaultPermission` controls permissions applied to newly created rows.
- Each row's `permission` controls who can read, update, execute, refer to, or delete that row.

A common mistake is to grant authenticated users table-level read and also leave row defaults with group read. That makes every signed-in user able to enumerate other users' mailbox rows.

## Recommended Shape

For private mail rows, keep row access owner-scoped:

```yaml
Tables:
  - TableName: mail
    Permission: 561408
    DefaultPermission: 12672
    AccessGroups:
      - Name: users
        Permission: 638976

  - TableName: mail_account
    Permission: 577792
    DefaultPermission: 12672
    AccessGroups:
      - Name: users
        Permission: 573440

  - TableName: mail_box
    Permission: 577792
    DefaultPermission: 12672
    AccessGroups:
      - Name: users
        Permission: 573440
```

The values above mean:

- `12672`: row owner has `Peek`, `Read`, `Execute`, and `Refer`; guests and groups have no row access.
- `573440`: table relation grants group `Peek`, `Read`, and `Execute`.
- `638976`: table relation grants group `Peek`, `Read`, `Create`, and `Execute`.

`mail` needs authenticated table-level create when Daptin's SMTP receive path stores a message as the recipient user. This is not the same as granting group read on every `mail` row. The `mail` row itself should still be owner-only.

`mail_account` and `mail_box` normally need table reachability so users can load their own rows and execute mail actions. They should not grant group row read.

## Why `DefaultPermission: 569633` Is Wrong For Private Mail

`569633` includes group row access. If mailbox rows are created with that value, one signed-in user can potentially list another user's mailbox rows when they know or guess filter values such as `mail_account_id`.

For private mailbox data, use `12672` for `mail`, `mail_account`, and `mail_box` row defaults unless you deliberately want group-visible mail data.

## Existing Rows Need Repair

Changing `DefaultPermission` affects future rows. It does not automatically rewrite existing row permissions.

After changing the schema, repair existing rows through Daptin APIs or `daptin-cli`:

```bash
daptin-cli --output json --no-truncate list mail_account --page-size 1000
daptin-cli update mail_account "$MAIL_ACCOUNT_REF" permission=12672

daptin-cli --output json --no-truncate list mail_box --page-size 1000
daptin-cli update mail_box "$MAIL_BOX_REF" permission=12672

daptin-cli --output json --no-truncate list mail --page-size 1000
daptin-cli update mail "$MAIL_REF" permission=12672
```

For many rows, enumerate references and update each row. Keep this as a controlled operational repair, not as a schema-only deploy assumption.

## Verification Checklist

Test with at least four contexts:

- guest, no token;
- user A;
- user B;
- administrator or operator.

Expected results:

- Guest cannot list `mail_account`, `mail_box`, or `mail`.
- User A's unfiltered `mail_account` list returns only A's account.
- User A's unfiltered `mail_box` list returns only A's folders.
- User B's unfiltered lists return only B's rows.
- User A filtering `mail_box` by B's `mail_account_id` returns no rows.
- User B filtering `mail_box` by A's `mail_account_id` returns no rows.
- User A cannot `get mail_account <B account ref>`.
- User B cannot `get mail_account <A account ref>`.
- Normal users cannot create `mail_account` or `mail_box` directly.
- Normal users cannot update mailbox rows unless your application explicitly needs that.
- A user cannot execute a send action against another user's `mail_account`.
- A user can execute a send action against their own `mail_account`.
- The delivered `mail` row is visible to the owner and has `permission=12672`.
- Other users cannot see the delivered message row.

Do not treat an administrator list as proof of a normal user's mailbox contents. The user context is part of the authorization evidence.

## Notes On Errors

Some invalid cross-user writes can fail at the reference check, for example when a caller tries to create a `mail` row that refers to another user's `mail_box`. That is still useful evidence that the referenced row is protected.

Also test the supported mail action path. A direct table create can fail for reasons unrelated to authorization, such as a required blob-backed `mail` column.

## Summary

For private Daptin mail:

- Open the table/action gate through `AccessGroups`.
- Keep mail rows owner-only with `DefaultPermission: 12672`.
- Repair existing rows after changing defaults.
- Verify with separate guest, owner, other-user, and admin contexts.
- Do not confuse table reachability with row visibility.
