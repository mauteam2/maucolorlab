# ELIFORA Engineering Rules

Every agent must read this file before changing the repository.

## Product identity and scope

- The product name is **ELIFORA**. Use it in product UI, documentation, package descriptions, and architecture language. The repository may remain `mauteam2/maucolorlab`.
- ELIFORA is a Color Intelligence and Salon Operating System for professional colorists and salons.
- Implement only the requested phase or vertical slice. Do not add speculative business features or production experiments.
- Every phase must leave Android, Web, database migrations, and their applicable tests buildable.

## Supported stack

- Android: native Kotlin, Jetpack Compose, Material 3, Coroutines/Flow, and explicit dependency injection.
- Web: TypeScript, React, and Next.js App Router with deliberate server/client boundaries.
- Backend: Supabase Auth, PostgreSQL, Row Level Security, private Storage, and Realtime only where justified.
- Shared critical API shapes live in `contracts/`; Android and Web must not invent conflicting contracts.

## Module boundaries

- `apps/android`: professional Android application. Keep UI, domain, and data concerns separate. UI must not know persistence details.
- `apps/web`: responsive management and mobile-browser application. Browser code never imports server-only modules.
- `supabase`: reproducible local configuration, ordered migrations, database tests, and server functions.
- `contracts`: machine-readable shared service contracts.
- `docs`: product boundaries, operational guidance, and accepted architecture decisions.
- Critical domain operations, authorization, finance, inventory, audit, subscription/quota, Color Engine, Risk Engine, and Brand Adapter behavior belong behind a server-side service boundary.

## Security and tenancy

- Deny by default. Never trust client-supplied organization IDs, location IDs, roles, permissions, prices, or ownership claims.
- Never use user-editable JWT metadata for authorization. Resolve authorization from authenticated database memberships.
- Every tenant-owned row must have explicit organization ownership and location ownership where relevant.
- Application filtering is not tenant isolation. RLS must enforce tenant boundaries and revoked access.
- Keep service-role and secret keys out of Android, browser bundles, logs, fixtures, and committed files.
- Use private storage for technical media when that slice is implemented. Do not log secrets or unnecessary customer payloads.
- RLS changes require real allow/deny tests, including cross-tenant and revoked-membership cases.
- Critical operations require authorization, validation, conflict handling, correlation IDs, audit coverage, and tests.

## Data and migration discipline

- Apply schema changes only through forward, ordered migrations. Never edit a migration already applied to a shared environment; add a corrective migration.
- Do not run production migrations or connect this repository to production during development work.
- Use stable identifiers, constraints, justified indexes, and relational columns instead of generic JSON where structure is known.
- Preserve important technical and financial history through versioning or reversal. Do not silently rewrite historical attribution.
- Prefer archive-first lifecycle rules where deletion would damage history.
- Represent unknown and imported/unverified states explicitly.
- Keep audit events append-oriented and immutable to normal application roles.
- Design mutable records for future field-level offline conflict resolution; use controlled versions/reversals for critical records.

## Quality and delivery

- Add tests with the behavior they protect. Critical operations and RLS changes always require tests.
- Do not weaken, skip, or silently rewrite a test just to make CI green.
- Run the relevant local build, test, lint, typecheck, and migration checks before reporting completion. State exact environmental blockers.
- Use stable releases only unless an exception is explicitly requested and documented.
- Do not perform unrequested dependency upgrades or broad formatting changes.
- Never commit secrets, local environment files, generated build output, or real salon/customer data.
- Maintain Dev → Staging → Pilot → Production separation. No production experiments.
- Prefer small, coherent commits and do not rewrite unrelated history.

