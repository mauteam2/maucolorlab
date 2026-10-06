# ELIFORA

ELIFORA is a professional Color Intelligence and Salon Operating System for independent colorists and small to medium salons. The verified foundation now includes authentication, Hair Passport, Risk/Color engines, brand catalog governance, controlled recipes, live color sessions and Phase 4A salon operations.

## Repository map

- `apps/android`: native Kotlin, Jetpack Compose, and Material 3 professional application shell.
- `apps/web`: responsive React and Next.js App Router application shell.
- `supabase`: local Supabase configuration, identity/tenant migration, and pgTAP RLS tests.
- `contracts`: shared OpenAPI and runtime-aligned schemas for critical service operations.
- `docs`: product scope, architecture decisions, security model, and developer guidance.

Read [AGENTS.md](./AGENTS.md) before making changes. Detailed local setup is in [docs/development/setup.md](./docs/development/setup.md).

No production environment is configured, no production migrations are run, and no real salon data belongs in this repository.


Phase 4A workflow and limits: [Salon operations](docs/development/phase-4a-salon-operations.md).
