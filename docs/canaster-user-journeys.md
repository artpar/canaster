# Canaster User Journeys

Last updated: 2026-06-17

This document describes the product journeys the app should support from the user's point of view. It is intentionally written in product language. Backend details remain implementation notes elsewhere.

Release-readiness evidence for these journeys is tracked in `docs/current/canaster-release-readiness-report.md`.

## Product Frame

Canaster is a nested visual workspace for planning operational work. The primary user is a non-technical professional who needs to keep a job, site, crew, proof, and follow-up work connected without thinking in database, dashboard, or whiteboard terms.

The interface should feel like one calm work surface:

- The canvas is the primary workspace.
- The top command bar is the only persistent toolbar.
- Documents and Work Items share one right-side utility drawer.
- Account actions live in a toolbar popover, not as a permanent login bar.
- The bottom-left map stays available for orientation.
- Local saving works without an account; online saving is explicit and discoverable.

## Journey 1: Start Working Without an Account

Goal: A new user can begin planning immediately without signing up first.

Entry point:
- User opens Canaster for the first time.

Flow:
1. The starter workspace opens on the canvas.
2. The toolbar shows the workspace title, New, Open, Save online, canvas controls, Work Items, and Account.
3. The user can pan, zoom, select items, and enter nested views.
4. Changes are saved locally on the device.
5. The status text communicates local saving without implying an account is required.

Success state:
- The user has a usable local workspace and understands that work is safe on this device.

Important failure states:
- If local storage fails, the app should show a plain recovery message and avoid claiming the work is saved.

## Journey 2: Move Through a Nested Job

Goal: A user can move from the big job view into details and back out without losing context.

Entry point:
- User is looking at a workspace with nested view items.

Flow:
1. The user selects a view item on the canvas.
2. The down arrow in the toolbar opens the selected child view.
3. The up arrow returns to the parent view.
4. The bottom-left map shows the current view, parent path, nearby siblings, and children.
5. The user can click map nodes to travel between related views.

Success state:
- The user always knows where they are and can move up, down, and sideways without hunting.

Important failure states:
- If no child view is selected, the down command is disabled and its label explains what is needed.
- If a view has no parent, the up command is disabled.

## Journey 3: Use Work Items When the Canvas Feels Busy

Goal: A user can switch from spatial editing to a plain list without opening another toolbar.

Entry point:
- User clicks Work Items in the top command bar or from the starter guide.

Flow:
1. The right-side utility drawer opens in Work Items mode.
2. The drawer lists items in the current view.
3. The user can select items and use available item actions.
4. Opening Documents or Account closes or replaces the Work Items surface.

Success state:
- The user can inspect and act on the current view without losing the canvas.

Important failure states:
- If no item is selected, selection-dependent actions should communicate the inactive state through disabled controls.

## Journey 4: Save Online From a Local Draft

Goal: A user can turn local work into an online document when they are ready.

Entry point:
- User clicks Save online while signed out.

Flow:
1. The Account popover opens.
2. The status explains that sign-in is needed to save online.
3. The user signs in or creates an account.
4. The user clicks Save online again, or the current save action continues if the implementation supports that later.
5. The first online save creates a saved document.
6. Later saves update that document.

Success state:
- The local draft becomes an online document and the toolbar status changes to a saved state.

Important failure states:
- Signup/sign-in errors should wrap in the popover and show the full message.
- Failed online save must not destroy the local draft.
- The UI should keep using product language such as Save online and Documents.

## Journey 5: Open a Saved Workspace

Goal: A returning user can find and open a saved workspace without a separate document toolbar.

Entry point:
- User clicks Open in the top command bar.

Flow:
1. The right-side utility drawer opens in Documents mode.
2. If signed out, the drawer explains that sign-in is needed to see saved workspaces.
3. If signed in, the drawer lists saved workspaces with the active document marked.
4. The user selects a document.
5. The canvas loads that workspace snapshot.
6. The toolbar title and save state update to match the opened document.

Success state:
- The chosen workspace is restored, including nested views, current canvas state, and saved document identity.

Important failure states:
- If listing documents fails, the drawer should preserve the current workspace and show a retry path.
- If opening a document fails, the current local canvas should remain intact until a valid snapshot is loaded.

## Journey 6: Create a New Workspace

Goal: A user can start a new workspace without accidentally creating empty online documents.

Entry point:
- User clicks New in the top command bar or Documents drawer.

Flow:
1. The app creates a local draft first.
2. The active online document selection is cleared.
3. The workspace title returns to the default title.
4. Local autosave continues on the device.
5. Save online creates a new online document only when the user explicitly saves.

Success state:
- The user starts fresh without polluting their online document list with empty drafts.

Important failure states:
- If a user has unsaved online changes, the app should eventually warn before replacing the current workspace. The current MVP can rely on explicit Save online plus local autosave, but destructive replacement should remain a design concern.

## Journey 7: Return Later on the Same Device

Goal: A user can close and reopen the app without losing work.

Entry point:
- User reloads or returns to Canaster.

Flow:
1. If signed out, the local draft opens from device storage.
2. If signed in and an active online document exists, the app attempts to restore that document.
3. If online restore succeeds, the toolbar shows the document title and saved state.
4. If online restore fails, the app should keep the local cached workspace available and communicate the problem.

Success state:
- The user lands back in the most relevant workspace without needing to understand storage layers.

Important failure states:
- Network failure should not erase local work.
- Token/session failure should route the user to Account without blocking access to locally saved work.

## Journey 8: Sign Out

Goal: A user can leave the account safely without losing local work.

Entry point:
- User opens Account and clicks Sign out.

Flow:
1. The current workspace is saved locally.
2. Account token and active online document selection are cleared.
3. The toolbar returns to local save status.
4. The canvas remains usable.

Success state:
- The user is signed out, but their current work is still available locally.

Important failure states:
- Sign-out should not clear the visible workspace.
- If sign-out fails remotely, local session cleanup still needs a clear and predictable policy.

## Journey 9: Work on a Small Screen

Goal: The same journeys remain usable when the toolbar wraps.

Entry point:
- User opens the app on a narrow viewport.

Flow:
1. Toolbar groups wrap into a compact multi-row command bar.
2. Account popover and utility drawer open below the wrapped toolbar.
3. The bottom-left map remains visible below the drawer surfaces.
4. Save online remains reachable, with compact labels where needed.

Success state:
- No toolbar text, popover status, document drawer, or map content overlaps incoherently.

Important failure states:
- Long account error messages must wrap.
- Drawer content should scroll inside the drawer instead of covering orientation controls.

## Journey 10: Recover From Account or Save Errors

Goal: A user can understand what failed and what to do next.

Entry point:
- Signup, sign-in, document list, open, or online save fails.

Flow:
1. The relevant surface shows the full error message.
2. The message uses plain language and avoids backend names.
3. The user can correct credentials, retry refresh/open/save, or continue locally.
4. Existing local work remains available.

Success state:
- The user can recover without losing work or needing technical knowledge.

Important failure states:
- Error text must not be clipped in the Account popover.
- A failed remote save should leave the workspace dirty rather than falsely saved.
- A failed document open should not partially replace the canvas.

## UX Invariants

- One persistent toolbar only.
- No permanent login bar.
- No simultaneous Documents and Work Items drawers.
- Account popover should not sit on top of utility drawers.
- The minimap is separate from account/document storage UI.
- Canvas engine code should stay independent of account and backend concerns.
- User-facing text should say workspace, document, account, save, and open; it should not expose backend implementation names.
