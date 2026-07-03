# Document Visibility Implementation

Date: 2026-07-01

## Decision

Canaster document visibility is backed by Daptin's built-in `document.permission` row bitmask. The UI exposes only the visibility states that Canaster can truthfully enforce today:

- Private: only the owner can open and save the workspace.
- Public: anyone with the workspace link can open the workspace.

Visibility changes are not generic document CRUD. The browser calls schema-managed Daptin actions that perform fixed owner-only permission transitions:

- `set_canaster_document_private`: sets `document.permission = 16256`.
- `set_canaster_document_public`: sets `document.permission = 16259`.
- `set_canaster_asset_private`: sets `asset.permission = 16256`.
- `set_canaster_asset_public`: sets `asset.permission = 16259`.

Each action checks `subject.user_account_id == user.reference_id` before patching the row. The browser must not use JSON:API `PATCH` to update `permission` on either `document` or `asset`.

Group sharing is deliberately not exposed in this pass. Daptin group access requires both table-level `world` access and record-level group access. Canaster does not yet have a product contract for creating groups, choosing groups, inviting users, or managing membership, and app UI must not construct generated Daptin join table names.

## Source Contract

The current persistence contract stays unchanged:

- Workspace data remains one JSON file blob in Daptin built-in `document.document_content`.
- Visibility remains outside `document_content`.
- Private rows use `permission = 16256`.
- Public-readable rows use `permission = 16259`.
- Existing `makeDocumentPrivate` and `makeDocumentPublic` APIs remain available, but they call Daptin visibility actions rather than generic row updates.
- The document and asset world rows declare authenticated-user table access through `Tables[].AccessGroups`, not through per-row `DefaultGroups`.
- The four visibility action rows declare `Actions[].AccessGroups` so normal signed-in users can execute those specific actions without granting `GuestExecute`.
- Do not add `DefaultGroups` to `document` or `asset`; those row-level group relations make private rows readable by the whole users group.

## UI Contract

Visibility belongs in the Documents drawer because it is a saved-online document property, not canvas model state.

The active saved document shows:

- current visibility;
- a compact Private/Public segmented control;
- a copy-link action only when a saved document exists.

Signed-out local drafts do not show visibility controls. They remain local until Save online creates a Daptin document.

Signed-in non-owners can open public workspaces but cannot change their visibility. The UI disables the Private/Public controls for those rows; the backend action still performs the authoritative owner check.

## What Not To Add

- Do not add `document_acl`, `owner_id`, `visibility`, `share_token`, or invite tables for this pass.
- Do not store visibility, owner, members, or group ids inside the workspace snapshot.
- Do not expose a Shared state until Daptin usergroup membership and group-row permissions are implemented through a supported adapter.
