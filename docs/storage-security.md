# Private Storage and browser persistence

The current application bucket is `live-technical`, private. Read policies resolve
the reserved live_photos row and its RLS-protected session; path spelling is never
authorization. Insert checks the reserved uploader, active session, current scope,
contribute permission and SaaS storage source gate/quota. Upsert is disabled;
original accepted bytes may replay idempotently, changed bytes conflict.
Archive/revocation/foreign tenant denial follows the underlying session/client rules.

Authenticated Storage object policies are additionally restricted by the same
provider session predicate as the Data API. Storage does not run PostgREST hooks.
No public bucket or long-lived signed object URL is introduced. Downloads are
proxied with fresh authorization before release, private/no-store and nosniff.
There is no signed URL expiry guarantee to claim: supported technical reads use
the authenticated proxy, not a bearer link that remains live until its TTL.

Supported uploads are PNG/JPEG/WebP, at most 10 MiB. The Web upload boundary
checks MIME plus file signatures, not extensions; HTML/SVG declared as image/png
is rejected. Signatures are not a complete malware/decoder scan. Direct Storage
is still governed by bucket MIME/size and DB ownership policies; malformed
image bytes are never executed. Avoid future active-content rendering or SVG.

The approved logo files are static application assets, not customer storage.
No second customer-image bucket is invented. Catalog source links are public
official references and do not grant private attachment access.

Persistence inventory: provider auth cookies managed by SDK; opaque workspace
reference cookie; intro once-per-tab marker in sessionStorage; encrypted Phase 8
IndexedDB payloads and legacy sealed records; non-secret generated device metadata.
Draft decryption keys stay in memory, scoped to fresh user/org/location/membership.
Android auth/draft material uses Keystore AES-GCM; backups are disabled. Never
delete the intentional vault or persist full private server snapshots to localStorage.
