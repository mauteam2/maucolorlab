# Developer setup

## Prerequisites

- Git
- Node.js 24 and npm 11
- JDK 17 or newer; Android builds emit Java 17 bytecode
- Android SDK Platform 37 and Build Tools 36.0.0
- Docker Desktop or another Docker-compatible daemon
- Supabase CLI 2.117.0

## Environment

Copy the root `.env.example` to `apps/web/.env.local` and replace only the local placeholders printed by `supabase status`. A publishable key may be exposed to a client; a secret/service-role key may not be placed in `NEXT_PUBLIC_*`, Android properties, committed files, or logs.

Android accepts `ELIFORA_SUPABASE_URL` and `ELIFORA_SUPABASE_PUBLISHABLE_KEY` from Gradle properties or process environment. The emulator default URL is `http://10.0.2.2:54321`. Do not supply a secret/service-role key.

## Local Supabase

From the repository root:

```shell
supabase start
supabase db reset
supabase db lint --local --fail-on warning
supabase test db
```

`supabase db reset` rebuilds only the local database. Never run reset or migration commands against a linked production project from this workflow.

## Web

From `apps/web`:

```shell
npm ci
npm run lint
npm run typecheck
npm run test
npx playwright install chromium
npm run test:e2e
npm run build
```

The E2E server uses port 4173 to avoid colliding with a normal development server. The normal app starts with `npm run dev` on port 3000.

## Android

From `apps/android` on macOS/Linux:

```shell
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
```

On Windows, use `gradlew.bat` with the same tasks. Instrumented UI tests require an emulator or physical device:

```shell
./gradlew :app:connectedDebugAndroidTest
```

## Before a commit

Run the checks for every area changed. For tenant, permission, policy, or audit changes, `supabase test db` is mandatory. Review `git diff --check`, the complete diff, and `git status` before committing.

