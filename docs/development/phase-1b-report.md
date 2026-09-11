# ELIFORA — Phase 1B delivery report

Date: 2026-09-11. Branch: `codex/phase-1b-client-identity`.

## Delivery and entry gate

The slice implements verified workspace → organization client directory → create →
server duplicate review → detail → edit basic identity/contact → archive/restore on
Web and native Android. Client identity belongs to the organization. Creation-location
provenance does not restrict the client to that location. No subsequent product slice
has been started.

Entry was verified against clean Phase 1A head
`27f2f5d3f93d8802e8577d29f6deee12925f5cf8` and its successful
[Phase 1A CI run](https://github.com/mauteam2/maucolorlab/actions/runs/34487655135).
The delivery branch was created from that head. No production database was contacted.

Functional integration passed in [CI run 34600217684](https://github.com/mauteam2/maucolorlab/actions/runs/34600217684):
120 database assertions, 51 Web unit tests, 53 Android unit tests and 30 browser tests.
The final focus-preservation regression adds two Android tests and two browser tests.
Final implementation verification: **PASS — all four jobs green** in
[CI run 34601072709](https://github.com/mauteam2/maucolorlab/actions/runs/34601072709).

## Commits

| Commit | Result |
| --- | --- |
| `c1c14a8` | Organization client schema, RLS service, duplicate review, audit and database tests |
| `ee6c166` | Remove an unused duplicate-review record identified by database lint |
| `704b88b` | Web and native client workflows, shared contract, unit and E2E coverage |
| `e17ca8f` | Bind open forms to their verified workspace; extend concurrent and inactive-access checks |
| `a01eb13` | Correct strict typing of known fixture-array indices |
| `eb8818b` | Use existing membership error vocabulary; document service guarantees and validate commands |
| `ca5c39e` | Conceal lost access immediately; discard edit drafts if the client was archived |
| `d3b0696` | Preserve birth-date calendar days across viewer time zones |
| `f61fae0` | Preserve form focus during periodic access checks while retaining denial handling |

This report and the final test-assertion cleanup follow those implementation commits.
No unrelated history was rewritten. Final delivery checks include clean working tree
and equality of local/remote delivery heads.

## Migration and architecture

One forward migration was added after Phase 1A:
`supabase/migrations/20260911073704_client_identity_and_duplicate_review.sql`.
It was created with the local Supabase migration CLI and replayed on fresh disposable
CI databases. No previously shared Phase 0/1A migration was changed. The unused-variable
correction was made to the new development migration before any shared deployment.

See [ADR 0008](../architecture/adr-0008-client-identity-and-duplicate-review.md)
for exact permission, phone, duplicate, retry, lifecycle and search decisions.

- Clients contain only name, canonical phone, optional email/birth date, organization,
  immutable creation provenance, status, timestamps, actors and mutable-record version.
- Phone has a non-unique comparison index. TR national formats and explicit international
  country codes normalize server-side. Other national locales require an explicit country
  code. Number format is checked; ownership/carrier validity is not claimed.
- Duplicate signals are exact normalized phone/name/email and birth date with a matching
  name prefix. Review includes archived candidates and never crosses organizations.
- The public RPC is SECURITY INVOKER. Its private implementation runs as a NOLOGIN,
  NOBYPASSRLS role that does not own the tables. RLS remains active inside the service.
- Ten-minute review tokens bind the actor, verified scope, operation, unchanged payload
  and all candidate versions. Separate-person confirmation is explicit and audited.
  There is no automatic merge, client-only bypass, or uniqueness restriction on phones.
- Organization transaction locks serialize duplicate decisions. Row versions prevent
  lost updates. Private 24-hour receipts make identical mutation retries idempotent.
- Web validates Auth, workspace and permission server-side. An additional workspace
  precondition stops a second tab changing the destination of an open form. Same-origin
  JSON requests and no-store responses protect the cookie-based API boundary.
- Native models, repository interface, authenticated adapter, controller states and
  Compose UI are separated. Composables do not call Supabase directly.
- Existing Phase 1A sign-in/selection/logout behavior is retained. A narrowly scoped
  additive foreground-refresh path fixes periodic form unmounting; a regression test
  proves that a pending refresh preserves Ready but a revoked result still removes it.
  Background restoration, errors, tenant changes and logout continue to conceal data.

## Security and behavior evidence

The 69 new pgTAP assertions retain all 51 original assertions. They cover anonymous
read/RPC denial; foreign-organization read/update/archive denial; forged organization
and actor rejection; immutable ownership; revoked/invited memberships; archived
organizations/locations; authorized cross-location organization reads; read-only role
write denial; private review/receipt access denial; non-unique phones; explicit shared
phone creation; phone edits requiring review; token tampering, expiry and replay;
version conflicts; idempotent retry; email/name/birth signals; archive/restore; hard
delete denial even under table ownership; old/new audit values and no duplicate audit.

The existing membership model has `invited`, `active` and `revoked`, not an independent
`ARCHIVED` status. Tests deny access through archived organizations/locations and all
inactive membership states without adding staff lifecycle administration.

Browser tests use real disposable Supabase Auth and RPCs on desktop and mobile Chromium.
They cover minimum creation and required validation, masked directory results, name and
phone search, normal edit, exact-phone warning, opening an existing candidate, explicit
separate-person creation, duplicate review on phone edit, archive confirmation, active
list exclusion, archive retrieval, restore, foreign URL/mutation denial, forged fields,
revocation, offline concealment/recovery and changed workspace references. Concurrent
creates produce one success and one review; concurrent confirmations produce one
success and one stale-review rejection. The final regression checks draft and focus
after a periodic verification response.

Native JVM tests cover directory/empty/search, form validation, normal create, review,
explicit confirmation, candidate navigation, versioned edit/phone recheck, confirmed
archive/restore, tenant changes, revoked access, late-result concealment, draft resume,
permission downgrade, archived drafts, idempotent retries, transport/domain errors,
correlation IDs and periodic form preservation with denial handling.

Server revocation applies to the next request immediately. Idle visible UI detects it
on the 15-second poll or the next foreground/focus event; instantaneous push-driven UI
revocation is not claimed. Drafts/review tokens are memory-only. No customer persistence
or offline mutation queue was added.

## Verification commands and results

| Check | Command | Result |
| --- | --- | --- |
| Web lint | `npm run lint` in `apps/web` | PASS locally and CI |
| Web types | `npm run typecheck` | PASS locally and CI |
| Web unit | `npm run test` | PASS: 51 tests, 11 files; original 25 retained |
| Web production build | `npm run build` | PASS locally and CI |
| Browser secret boundary | `node scripts/verify-browser-bundle.mjs` | PASS in CI against the actual disposable service key |
| Desktop/mobile E2E | `npm run test:e2e` | PASS: 32 tests; original 18 retained |
| Android unit/lint/APKs | `gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest` | PASS locally: 55 JVM tests, original 26 retained; both APKs compile |
| Android CI | Same tasks with `./gradlew` | PASS |
| Fresh migrations | `supabase start` on disposable CI database | PASS |
| Database lint | `supabase db lint --local --fail-on warning` | PASS: no schema errors |
| RLS/service tests | `supabase test db` | PASS: 120 assertions across 3 files |
| OpenAPI/workflows/shared vocabulary | `python scripts/validate-contract.py` | PASS locally and CI; six commands and unsafe-payload rejection cases |
| Secrets | Gitleaks 8.30.1 `git --redact --no-banner .`, plus staged `stdin` scan | PASS; no leaks |
| Whitespace | `git diff --check` | PASS |
| Device UI execution | `:app:connectedDebugAndroidTest` | **NOT RUN**: no emulator/device connected |

Local Android uses Android Studio's JBR 21 and installed SDK platform 37.0. CI uses
Temurin 17 and the same pinned Gradle/Android dependencies. No application dependency
upgrades were made. Python validation uses `scripts/verification-requirements.txt`.

Initial verification found an unused SQL variable and an E2E selector that also matched
Next.js's route announcer. The variable was removed and the assertion scoped to the
application's main region, preserving the denial expectation. Strict fixture-index
typing was corrected. No existing tests were weakened, skipped or removed.

## Visual and performance review

Synthetic client form, detail and duplicate-review captures were generated on desktop
and mobile Chromium. Mobile form/detail/review and desktop review were inspected for
layout, labels, field widths and readable confirmation actions. The UI reuses ELIFORA's
existing light/dark tokens and native Material 3 theme. No branding redesign or fake
Hair Passport, ColorLab, appointment, financial or risk data was introduced. CI's
selected PNG artifact is retained for seven days and contains synthetic fixtures only;
auth traces and session-state files are not captured.

Directory pages default to 25 minimal masked summaries (maximum 50), fetch one extra
row for `has_more`, and cap offset at 10000. B-tree indexes support organization/status
ordering and exact duplicate signals; partial indexes cover optional email/birth date;
GIN trigrams support name/phone substrings. Foreign-key indexes cover actor/provenance
lookups. Short name queries can use the organization/status path. Organization locking
is a deliberate correctness tradeoff for this initial workflow; measure query plans
and lock waits with realistic staging volumes before changing it. No production-scale
latency, query-plan benchmark or heavy search infrastructure is claimed.

## Environment limits and operations

Local Docker is unavailable, so local database replay and authenticated browser E2E
were executed on GitHub's disposable Docker runners. Missing local prerequisites were
not treated as local passes. Hosted Supabase advisors were not run against a shared or
production project; database lint and real RLS tests provide this slice's evidence.

No Android emulator or physical device was connected (`adb devices` returned an empty
device list). Instrumentation compilation is PASS; device execution is **NOT RUN**.
No production migration, deployment or real salon/customer-data import was performed.

Expired private review tokens/receipts stop authorizing operations at expiry. Physical
cleanup is opportunistic on subsequent actor/organization mutations, not a scheduled
retention guarantee. Client test fixtures remain until the disposable database is
stopped because their history must not be hard-deleted just for test cleanup.

## Changed-file inventory

Reproduce the exact inventory with `git diff --name-only 27f2f5d HEAD`.

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/20260911073704_client_identity_and_duplicate_review.sql`; `supabase/tests/client_identity.test.sql` |
| Shared contract/verification | `contracts/openapi.yaml`; `scripts/validate-contract.py`; `.github/workflows/phase-0.yml` |
| Web API | `apps/web/app/api/clients/route.ts`; `route.test.ts`; `apps/web/proxy.ts` |
| Web protected pages | `apps/web/app/workspace/clients/layout.tsx`; `page.tsx`; `new/page.tsx`; `[clientId]/page.tsx` |
| Web UI | `apps/web/components/client-workspace.tsx`; `workspace-shell.tsx`; `apps/web/app/globals.css` |
| Web domain/service | `apps/web/lib/clients/contracts.ts`; `contracts.test.ts`; `service.ts`; `service.test.ts`; `display.ts`; `display.test.ts` |
| Web E2E | `apps/web/e2e/clients.spec.ts` |
| Android integration | `apps/android/app/src/main/java/com/elifora/app/MainActivity.kt`; `di/AppContainer.kt`; `data/auth/SupabaseAuthRepository.kt`; `domain/auth/WorkspaceController.kt`; `ui/EliforaApp.kt` |
| Android client layers | Under the same Kotlin root: `domain/clients/Clients.kt`; `domain/clients/ClientController.kt`; `data/clients/SupabaseClientRepository.kt`; `ui/ClientScreens.kt` |
| Android resources | `apps/android/app/src/main/res/values/clients.xml`; `values-en/clients.xml` |
| Android tests | Under `apps/android/app/src/test/java/com/elifora/app`: `domain/auth/WorkspaceControllerTest.kt`; `domain/clients/ClientControllerTest.kt`; `data/clients/SupabaseClientRepositoryTest.kt` |
| Documentation | `docs/architecture/README.md`; `adr-0008-client-identity-and-duplicate-review.md`; `docs/development/setup.md`; this report |

## Next requested slice

**Phase 1C — Hair Passport Foundation + Technical Regions + Evidence/Confidence data
model.** It has not been started. Staff invitations and all other excluded workflows
remain outside this delivery.
