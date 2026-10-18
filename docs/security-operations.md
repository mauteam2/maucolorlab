# Security operations and key/dependency review

Development → staging → pilot → production are separate. No production keys,
provider checkout, pilot onboarding or destructive external penetration testing
is part of Phase 9. Never treat the development preview as an authenticated salon.

For an incident: conceal local private UI, revoke provider sessions/memberships as
appropriate, retain correlation IDs and append-only audit, determine scope without
dumping customer payloads, restore into isolation if required, then execute the
runbook validation before any reviewed cutover. Operator actions do not create a
salon membership; support access must not silently impersonate tenants.

Existing domain audit records preserve actor/org/location/object/action/reason/time/
correlation; normal roles cannot update/delete them. Auth provider owns identity
recovery/security history. Error responses use typed codes and safe correlation;
database messages, stacks, private URLs, tokens, passwords and technical payloads
must not be logged. Existing browser diagnostics retain only sanitized routes,
HTTP/timing/correlation and UI lifecycle/busy/width state.

Secret scanning retains full-history gitleaks plus a real browser bundle scan for
the disposable service/signing keys. Publishable/anon keys are intentionally public
and must not be confused with service-role tokens. No application runtime creates
a service-role client. Native release uses no cleartext transport, no packaged
server signing/provider key and no application backup.

Signing rotation design: server environment and private DB verifier key must match.
Stop issuing new signed operations, drain short-lived prepared envelopes and retain
old immutable accepted plan/recipe snapshots and hashes. They are historical facts,
not newly executable approvals; executable work must pass current signing, catalog,
Risk, version and epoch checks. Current schema supports one active signing key,
not a historical multi-key verifier. If external historical re-verification is
required, implement a versioned key-ID/verifier migration before rotation, never
replace historical attribution. Phase 8 draft/wrap derivation currently depends on
the same server secret: retain/decrypt/migrate old vaults under scoped authorization
before retiring it, or old encrypted drafts become unreadable. No production key
is rotated by this phase; this dependency is an explicit operational limitation.

Dependency review used npm audit. Next 16.3.4 was patched within its stable minor
series to 16.3.8, with matching eslint-config-next and compatible transitive security
updates. The production dependency audit is repeated in CI. Development lint-only
advisories with no compatible patch are recorded separately; do not use npm audit
--force to downgrade the framework or silently major-upgrade. Review published
advisory reachability, dependency tree and actual build/tests, not just the count.

CSP retains inline React/Next scripts/styles as documented in security-architecture;
full nonce-only CSP is not claimed. Provider rate limits plus bounded payloads,
engine validation/source gates and finite quotas remain the abuse foundation.
Hosted SMTP, backup/PITR, external penetration testing, signing-key migration and
release signing/device tests remain reviewed readiness work before a real pilot.
