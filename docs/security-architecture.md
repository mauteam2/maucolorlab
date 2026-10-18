# ELIFORA security architecture — Phase 9

This is a pre-pilot hardening slice, not permission to deploy or start a pilot.
Authority remains organization → active location → current membership → domain
permission → current entitlement → domain invariant. Competency never substitutes
for application permission. Entitlement never grants a role.

The Web server verifies the provider user and resolves workspace selection from
current DB memberships. Sensitive services recheck context before releasing data.
PostgREST's configured `app_private.require_active_session` additionally checks
the Auth JWT session ID against `auth.sessions` on every Data API request. Storage
uses the same predicate in a restrictive policy because it bypasses PostgREST.
Postgres SQL migration/pgTAP contexts without Auth JWTs are not provider sessions;
real authenticated JWTs must have a current matching session ID. Provider server
requests use the separate service role and do not impersonate salon members.

| Threat actor | Main enforced mitigation |
| --- | --- |
| Unauthenticated outsider | Provider authentication, deny grants, RLS; recovery response does not enumerate |
| Another tenant's user | DB-derived membership/location, foreign UUID denials, final context recheck |
| Reception exceeding its role | Separate preparation DTO; no live_session.view, full Hair/recipe/photo denied |
| Technical staff seeking finance | Cost/manage permissions and self-only commissions; report source-domain checks |
| Revoked member | Authoritative current membership on every command/read; late UI response concealed |
| Stolen/stale session | Auth session existence check, provider global revoke, strict origin, no-store, lifecycle concealment |
| Malicious replay | Permanent factual receipts, exact hashes, versions, epoch, original device identity |
| Compromised browser/client | Server-only chemistry/signing, strict schemas, controlled writes, no secret in bundle |
| Platform operator misuse | Separate operator allowlist/control plane, no implicit tenant membership or invisible support access |

Normal API clients use publishable keys and their own provider session. There is
no service-role application client. Disposable CI seeding uses a loopback-only
admin client; the key is masked and never shipped. `contracts/security-inventory.json`
classifies each function/HTTP method/action; CI validates both source and actual
migrated catalog. A classification file is not itself authorization middleware.

Existing source facts, audit, controlled history, terminal material reconciliation,
client merge locks, catalog lifecycle protocol and SaaS source gates are preserved.
New work does not widen historical reads during suspension/cancellation.

Web headers deny frames/objects, use nosniff/no-referrer, restrict capabilities
and connect origins, and set no-store on private paths. CSP retains inline scripts
and styles for the existing Next/React rendering model; it is not claimed to be
a nonce-only XSS policy. Production has no unsafe-eval and no wildcard connect.
HSTS is emitted for staging/pilot/production only; HTTPS termination remains an
operational prerequisite. Native release manifest disallows cleartext HTTP;
debug retains its explicit loopback/emulator policy.
