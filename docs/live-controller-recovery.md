# ELIFORA lost-controller recovery

`RECOVER_CONTROL` is an online, signed service command with mutation ID, newly
generated device ID, expected record version, expected control epoch and a required
reason. The UI never asks the operator to type a UUID. Only active owner/manager
memberships receive `live_session.recover`; normal controller permission is not
recovery authority.

The existing Live boundary resolves membership again after the organization lock,
locks the session row, and checks previous hash/version/epoch. Concurrent recoveries,
transfer, old-controller writes and termination serialize. One captured head can
accept one mutation; losers must fetch current state and make a new decision.

Recovery increments the epoch exactly once, assigns the authenticated actor and
the command's device, and appends a professional-decision history entry. DB guards
allow only controller fields, +1 version/epoch, timestamp and one validated history
append to change. Status, timers/anchors, start actor/time, recipe, steps, bowls,
usage, checkpoints, outcome and prior history remain intact. Terminal sessions
cannot recover or restart.

The immutable version and audit retain previous/new controller user/device/epoch,
authenticated actor, reason, time, mutation and correlation identity. A shared SaaS
lifecycle lock re-reads current subscription state/version for that audit. Existing
safe recovery is permitted during suspension; this exception grants no new session,
recipe, stock or finance creation entitlement. Historical replay rechecks current
membership and returns the original accepted response without acquiring new control.

Old epoch commands fail. An old device presenting the new epoch still fails the
controller check. Recovery is never included in draftable commands or the offline
dispatcher allowlist.
