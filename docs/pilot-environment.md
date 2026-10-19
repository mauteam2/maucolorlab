# ELIFORA controlled pilot environment

Phase 10 prepares a release, not public production. No hosted project, domain,
SMTP provider, backup service, support owner or professional review has yet been
identified in this task. Read-only connected project discovery on 2026-10-19 found
no ELIFORA staging/pilot project; no existing unrelated project was touched.
Their gates remain BLOCKED, not inferred from local CI.

Use separate Supabase projects and separate secret stores for development, CI,
staging and salon pilot. Never deploy against the disposable CI project or copy
its signing key, synthetic accounts, subscriptions, clients or files. Staging
starts empty except ordered migrations and reviewed system reference records.
The optional demo organization must be explicitly named DEMO / SYNTHETIC, with
synthetic identities and membership separated from real salons; preview routes
remain design demonstrations and do not authenticate a salon.

## Configuration

Deployment storage supplies NEXT_PUBLIC_SUPABASE_URL (hosted project URL),
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ELIFORA_SUPABASE_PROJECT_REF,
ELIFORA_DEPLOYMENT_ENV=staging or pilot, ELIFORA_APP_ORIGIN and
ELIFORA_ALLOWED_ORIGIN (same exact HTTPS origin), ELIFORA_COLOR_PLAN_SIGNING_KEY
(32 random bytes encoded as 64 hex digits), ELIFORA_RELEASE_SHA (exact built
commit), ELIFORA_RELEASE_VERSION (pilot.0.10.0-style), ELIFORA_RELEASE_CI_RUN,
ELIFORA_AUTH_POLICY=INVITE_ONLY, ELIFORA_SAAS_POLICY=CONTROLLED_OPERATOR_ONLY,
ELIFORA_SUPPORT_REFERENCE (safe operator reference), and
ELIFORA_ENVIRONMENT_ISOLATION=SEPARATE_PROJECT_AND_SECRETS.

`node scripts/validate-pilot-config.mjs` accepts environment variables, prints
invalid **field names only**, exits nonzero on failure. Its shape check is not
proof of separation, email delivery, quota configuration or backup availability.
Hosted startup invokes the same validator and refuses public production in this
phase. No runtime service-role/secret key is required or accepted. Provisioning
uses a separately authenticated operator connection, never the application.
Database connection, provider administration, SMTP and backup secrets belong in
separate restricted operator/hosted-provider storage; do not put them in Next
public variables, Git, APKs or screenshots.

The build generates a safe fingerprint from exact Git SHA, release/CI identifiers,
OpenAPI 0.24.0, engine 1.1.0, migration head/digest and catalog source checksum.
Hosted startup configuration and each authenticated workspace bootstrap check
the authoritative DB migration head, signing-key match and private bucket. A
partial migration or wrong key returns RELEASE_NOT_READY; it does not run a
business operation against that database. Authenticated no-tenant status reveals
only configuration and GLOBAL published catalog IDs/versions, never tenant rows.
Owner-only `/api/pilot/status` repeats membership after the read; no-store and
correlation are mandatory. It is **not** a public health endpoint or an SMTP/
Storage-upload guarantee. Support can copy version information from Settings →
pilot guide. Provider infrastructure health remains in restricted dashboards.

## Hosted Auth and mail

Disable public provider signup and anonymous users. Invite only the explicitly
approved identities through provider administration after the gate. Configure
exact HTTPS Site URL and `/auth/recovery/callback` allowlist, verified custom SMTP
sender/domain, confirmation, bounded OTP lifetime (900s baseline), session/JWT
expiry and provider abuse controls. Re-test invitation, confirmation, password
recovery through the existing PKCE flow, login/logout, refresh and global session
revocation against hosted mail. Record delivery and callback timestamps without
tokens or email bodies. Local Inbucket does not prove hosted email. Team provider
invitation and application membership are separate: existing CREATE_MEMBER reserves
a quota seat; a reviewed operator activates only the confirmed invited identity,
using the existing membership lifecycle and audit. A member must never grant
themselves a role from an invite URL or user metadata.

Supabase references reviewed 2026-10-19: [production checklist](https://supabase.com/docs/guides/platform/going-into-prod),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
Changelog warns a subset of old TLS 1.2 ciphers is removed 2026-11-10; test hosted
clients on supported TLS before approving their distribution. No SDK upgrade is
performed by this phase.

## Deployment procedure

1. Pin exact commit and successful matching CI; review 14-category checklist.
   Select isolated project, region, host and secret store; two-person review of
   project reference vs development/CI/production inventory. No DNS public launch.
2. Establish checkpoint/backup and signing-key escrow. Record retention and
   permitted restore target. Test access without printing connection strings.
3. Compare ordered migration history/digests with release. Apply forward migrations
   through the approved migration runner against this project only. Never use
   database reset, CI fixture scripts or ad-hoc business SQL on hosted data.
4. Verify migration history, db lint, actual grants/RLS/security inventory,
   private Storage policies, no unintended PUBLIC EXECUTE, and current session
   guard. Run synthetic allow/deny tests on isolated staging, not live tenants.
   `verify-security-database.py` intentionally refuses non-CI: its SQL inspection
   design is the checklist for the separately scoped hosted inspection; do not
   remove that guard to run fixture harnesses on hosted data.
5. Provision fresh matched server/DB signing material through secret operator
   storage; test only a bounded signed synthetic plan. Never reuse CI material.
   Import existing official catalog through existing governance, technical review,
   golden tests, approval and publication. Migration does not seed chemistry.
6. Deploy immutable Web artifact, validate exact fingerprint then hosted Auth,
   private upload/read/deny, two synthetic organizations and cross-domain smoke.
   Record separate hosted timings and actual backup/restore results.
7. Review evidence, named support coverage, consent/privacy decisions and expert
   review. Only user approval after this gate permits real salon onboarding.

Do not roll back immutable business history with a code rollback. Stop writes for
unsafe releases, preserve facts and use reviewed forward corrections. Previous
binary may restart only if its expected schema/signing/catalog protocol matches.
Keep the previous build and release notes; never deploy an unqualified “latest”.
