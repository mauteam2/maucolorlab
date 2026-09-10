# ELIFORA Phase 1A implementation report

Date: 2026-09-10
Branch: `codex/phase-1a-auth-tenant-context`

## Outcome

Real email/password Supabase authentication, session restoration/refresh/logout,
read-only membership discovery, verified organization/location selection, and a
protected application shell are implemented on native Android and Web.
No Client, Hair Passport, ColorLab, scheduling, stock, finance, dashboard metrics,
Google sign-in, or membership-administration workflow was added.

The complete implementation is verified on commit `26414cf` by
[CI run 34487084472](https://github.com/mauteam2/maucolorlab/actions/runs/34487084472).
No production or hosted Supabase project was accessed.

## Entry gate

Phase 0 was pushed before Phase 1A implementation. Run
[34471176604](https://github.com/mauteam2/maucolorlab/actions/runs/34471176604)
executed Docker-backed database lint and the original 28 pgTAP assertions successfully.
Its clean web dependency install and Android SDK package setup failed.
Commit `995df3d` added missing optional dependency lock entries and corrected
the SDK package to `platforms;android-37.0`, without dependency upgrades.
[Phase 0 rerun 34471453141](https://github.com/mauteam2/maucolorlab/actions/runs/34471453141)
passed all jobs. There was no unresolved Phase 0 security/schema gate failure.

## Files changed

Paths below are relative to the repository root. The complete implementation diff
is reproducible with `git diff --name-status 995df3d..HEAD`.

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/20260910112849_workspace_context_read_contract.sql`; `supabase/tests/workspace_context.test.sql` |
| Shared contract | `contracts/openapi.yaml` |
| Android domain | `apps/android/app/src/main/java/com/elifora/app/domain/auth/WorkspaceController.kt` |
| Android data | `data/auth/SupabaseAuthRepository.kt`, `SupabaseTransport.kt`, `SessionStore.kt` under the same Java package root |
| Android composition/UI | `MainActivity.kt`, `EliforaApplication.kt`, `di/AppContainer.kt`, `ui/EliforaApp.kt`; Turkish/English string resources |
| Android security/config | `app/build.gradle.kts`; main/debug manifests; `res/xml/data_extraction_rules.xml`; debug network security XML |
| Android tests | `WorkspaceControllerTest.kt` (16); `SupabaseAuthRepositoryTest.kt` (10); updated `FoundationUiTest.kt` |
| Web server | `apps/web/proxy.ts`; `lib/supabase/server.ts`; `lib/tenant/bootstrap.ts`; sign-in/workspaces actions and pages; workspace page/layout/loading; session API and workspace-reset routes |
| Web shared/UI | `lib/tenant/context.ts`; `lib/i18n/tr.ts`; sign-in and workspace shell components; app error/home pages and CSS |
| Web tests | Context, bootstrap, session response and reset route unit tests; auth E2E, local auth fixture helper, updated foundation E2E; Vitest/Playwright configuration and test server-only shim |
| Web build | `package.json` lint scope; Next-generated route type references in `next-env.d.ts` |
| CI/verification | `.github/workflows/phase-0.yml`; `scripts/validate-contract.py`; `verification-requirements.txt`; `verify-browser-bundle.mjs`; `.gitignore` |
| Documentation | `docs/architecture/adr-0007-auth-and-workspace-bootstrap.md`; `docs/development/setup.md`; this report |

Removed the Android placeholder auth repository/state/test and obsolete home
screen, and the superseded Web authenticated-user helper. Existing Phase 0 RLS
assertions remain unchanged.

## Migration and architecture decisions

The single forward migration adds the parameterless SECURITY INVOKER
`list_workspace_contexts()` RPC. Explicit caller ownership is narrower than the
owner's general membership-read privilege. It returns active memberships, active
organization/location display identities, role, and server-resolved permissions.
Organization-wide memberships expand to active locations; no active location means
no usable workspace. Bootstrap exposes no tenancy writes.

The migration also repairs a verified Phase 0 permission-helper defect: a missing
location could satisfy a LEFT JOIN null check. The helper now requires the requested
location to exist, belong to the organization, and be unarchived.

Clients persist only a membership/location reference for selection, then resolve it
against fresh results. A missing saved selection is cleared without silently
switching salons. Web guards each protected page and API request on the server.
Android separates transport, encrypted storage, repositories, state transitions,
and Compose UI. Keystore AES-GCM protects persisted tokens; password persistence
and backup/device transfer of preferences are disabled.

See [ADR 0007](../architecture/adr-0007-auth-and-workspace-bootstrap.md) for provider
endpoints, error mapping, refresh serialization, correlation IDs, and all tradeoffs.

## Security and behavior evidence

- 51 pgTAP assertions: all original 28 plus 23 new assertions. Own/other-user
  discovery, cross-organization filtering, location restriction, org-wide expansion,
  archived locations, forged tenancy writes, read-only selection, anonymous denial,
  live membership revocation, retained auth account, and permission-helper regression.
- 26 Android host unit tests: explicit auth/workspace states, fresh bootstrap,
  single/multiple contexts, process recreation, saved-reference validation, revocation,
  retry, logout, background/logout races, real REST adapter paths, token rotation,
  one-shot 401 retry, invalid refresh, transient refresh failure, and corrupt storage.
- 25 Web unit tests, including server auth-before-RPC, malformed payload rejection,
  permission/expiration errors, selection tampering, cache invalidation, no-store
  responses, correlation envelopes, an origin-preserving reset redirect, and
  concealment until fresh verification after mounting a cached route.
- 18 desktop/mobile Chromium E2E cases use real local Supabase for sign-in,
  automatic selection, multi-location selection, invalid selection, restart, refresh,
  logout, live revocation, invalid credentials, empty membership, and offline concealment.
  Tokens stay in test process memory; authentication traces are disabled.
- Secret checks use Gitleaks on history/staged changes. CI additionally checks the
  actual browser build for the disposable instance's privileged key.
- Sign-in UI inspected at 1440×1000 and 390×844; no horizontal overflow.

RLS blocks new salon reads immediately after revocation. The rendered identity is
concealed at the next foreground check (15-second interval), on focus/visibility
changes, or offline detection; it remains concealed during failed verification.
There is no tenant business data/action in this shell. Future operations must enforce
server authorization independently. Logout clears local credentials even offline;
provider refresh-token revocation requires connectivity.

## Commands and results

| Command / verification | Result |
| --- | --- |
| `git push -u origin codex/phase-0-foundation` | PASS |
| Phase 0 GitHub Actions rerun | PASS, run 34471453141 |
| `npm run lint` | PASS locally and CI |
| `npm run typecheck` | PASS locally and CI |
| `npm run test` | PASS locally and CI, 25 tests |
| `npm run build` | PASS locally |
| `npm run test:e2e -- foundation.spec.ts` | PASS locally, 4 desktop/mobile tests |
| `npm run test:e2e` | PASS in CI, 18 tests on desktop/mobile Chromium |
| `gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest` | PASS locally; equivalent Linux CI command PASS |
| `supabase db lint --local --fail-on warning` | PASS in Docker CI, no schema errors |
| `supabase test db` | PASS in Docker CI, 51 assertions |
| `python scripts/validate-contract.py` | PASS locally and CI |
| `gitleaks git --redact --no-banner .` | PASS locally and CI |
| `git diff --cached \| gitleaks stdin --redact --no-banner` | PASS, no staged secrets |
| `node scripts/verify-browser-bundle.mjs` | PASS in CI |
| `git diff --check` | PASS |
| `adb devices` | No device/emulator attached; instrumentation execution NOT RUN |
| `gradlew.bat :app:assembleDebugAndroidTest` after locale-independent UI assertion | PASS locally |

The first Phase 1A CI run
[34485735991](https://github.com/mauteam2/maucolorlab/actions/runs/34485735991)
passed Android, database, and contract/secret jobs. Web E2E exposed an absolute
redirect that changed loopback origins and a test locator colliding with Next's route
announcer. The redirect is now relative, and the locator targets the application's
main content. Original behavioral assertions were preserved.
The [rerun 34486604702](https://github.com/mauteam2/maucolorlab/actions/runs/34486604702)
passed all four jobs, including all 18 E2E cases.
The final implementation run linked above also verifies the subsequent protection
against briefly rendering router-cached tenant identity.

Other intermediate failures were corrected: Android debug network XML required
explicit includeSubdomains fields; Web type checking caught a DOM visibility
narrowing and an unchecked first cookie. These checks passed after correction.

## Environment limitations

Local Docker was unavailable, so real database and full authenticated E2E checks
run against disposable Docker-backed Supabase in GitHub Actions. No local
authenticated E2E pass is claimed. Android instrumented tests compile, but no device
execution or manual Android sign-in is claimed. To authenticate, Android needs
the environment's Supabase URL and publishable key, as documented in setup.
Existing non-fatal Android foundation warnings were not used to weaken lint.
No implementation blocker remains. Device execution remains an explicit
verification limitation, not a claimed PASS.

## Commits

- `995df3d` — minimal Phase 0 clean-CI repair, pushed on the Phase 0 branch.
- `0d95a39` — real Web/Android auth, verified tenant context, migration and tests.
- `2fa02a6` — preserve redirect origin, finish error/cache handling, expand contract tests.
- `26414cf` — conceal router-cached workspace identity until fresh verification.

The delivery commit adds this report and makes the compiled instrumentation
assertion use the device's localized sign-in label. The branch is pushed; the
working tree is clean at delivery. No merge or deployment was performed.

## Exact recommended next vertical slice

**Phase 1B: existing-salon staff invitation → acceptance → scoped active membership
→ owner/manager revocation.** Use server-authorized operations, audit events,
idempotent acceptance, and cross-tenant/role-escalation/revocation tests on both
platforms. Keep organization creation and salon business workflows outside that
slice. Phase 1B has not been started.
