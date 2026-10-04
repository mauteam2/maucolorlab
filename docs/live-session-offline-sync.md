# ELIFORA live session offline foundation

Timers persist server `anchorAt`, accumulated active seconds, status and initial
start. PAUSE freezes active elapsed time; RESUME uses a fresh server anchor.
Reloading an online session calculates the same elapsed time; independent
concurrent timers survive reload. Pausing the session does not automatically
pause chemical processing timers: each timer is explicitly controlled.

During an already-open offline session, timestamps keep timers moving. Notes,
checkpoint results, actual usage and photo bytes can be saved as IndexedDB
drafts. Scope is membership + location + tab device + session. Server snapshots
remain in memory; credentials are not stored in this draft database. IndexedDB
availability errors are visible. Drafts are local browser data and can be
explicitly removed.

Reconnect/focus revalidates membership and reloads the authoritative session.
The user explicitly synchronizes a draft only when its expected version and
control epoch still match. A changed version produces Conflict Review; it is
not automatically rebased. After one draft commits, another same-version draft
must be reviewed against the new state. Keep the existing mutation ID on a
network retry; changing payload under that ID returns a conflict.

Photo drafts reserve metadata and upload private bytes; incomplete uploads
remain drafts and block final completion. A historical idempotent metadata
receipt cannot overwrite newer session state. Critical start, transfer, recipe
replacement, permission changes, live risk finalization and completion cannot
be finalized offline. Timers are displayed offline, but timer transitions remain
online authoritative commands.

This is an offline foundation for an already-open browser workflow. It does
not promise an offline Next.js shell after a full browser restart, push alerts,
background scheduling or a native Android offline session. Viewer devices use
manual/focus refresh rather than a polling or Realtime subscription.
