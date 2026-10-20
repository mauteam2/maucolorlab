# ELIFORA private technical images

live-technical remains private. A restrictive policy denies all authenticated
direct object operations: upload/read/list/sign/update/delete. The existing
non-login Live writer retains scoped SELECT solely for signed persistence's
object-existence invariant. Separate restrictive INSERT/UPDATE/DELETE policies
deny mutations even through inherited SQL grants. The supported path
is Web livePhoto -> live-photo Edge -> Storage. Web has no service-role key.
After current membership and reservation checks it decodes/re-encodes PNG/JPEG/
WebP, strips metadata, rejects active/trailing payloads and signs a short-lived
purpose-separated proof binding scope, method, bytes hash, size and expiry.
The Edge function forwards the user JWT to live_photo_access before Storage and
again before responding. The RPC verifies HMAC, active provider session, current
DB membership, location, client, reservation, uploader, technical permission and
existing SaaS storage availability. The service-role cannot authorize itself.
Only Edge holds the built-in server credential, used solely for object transport.
Edge checks actual bytes against the approved digest, never upserts and compares
existing bytes for idempotent lost-response or concurrent retry.

All layers use 4 MiB (4,194,304 bytes), below the hosted request/response ceiling.
Input decoding is bounded to 24 megapixels and one image page. Accepted bytes
are the deterministic metadata-free re-encoding; original MIME is preserved.
Legacy accepted files are not silently rewritten. Larger files require reduction
before upload; no direct-upload exception exists.

Reads are buffered, reauthorized, private/no-store and nosniff. No end-user signed
URL is permitted. Already delivered bytes cannot be recalled; in-flight requests
can overlap revocation. Subsequent authorization checks deny further delivery.
No retroactive or instantaneous recall guarantee is claimed.

Normal roles cannot overwrite/delete accepted originals. Failed uploads can leave
a reservation without bytes: retry the same reservation. Retention/cleanup needs
explicit operator authorization, reference review, audit and backup consideration.
A DB backup contains metadata, not Storage bytes: preserve both separately.

Offline drafts remain encrypted and memory-key scoped; the same 4 MiB ceiling
applies. Background/lock/logout hides decrypted content and unlock requires fresh
membership. Static brand assets are not customer Storage objects.
