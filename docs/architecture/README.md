# ELIFORA architecture

ELIFORA uses one repository with three independently verifiable application roots: native Android, Next.js Web, and Supabase. This keeps shared policy and contracts close while avoiding a monorepo orchestration layer that Phase 0 does not need.

The Android app is the primary professional workstation and is designed around offline-capable repositories. The Web app is the responsive management surface and mobile-browser fallback. Both authenticate with Supabase, but critical mutations cross a server-side service boundary. PostgreSQL membership data and RLS remain the source of truth for tenant access.

```text
Android / Web
      |
      +-- Supabase Auth and RLS-protected reads
      |
      +-- Server-side service boundary
              |
              +-- authorization + validation + conflicts
              +-- critical domain operations
              +-- immutable audit append
              +-- PostgreSQL / private Storage / Realtime
```

Phase 0 establishes identity, organizations, locations, memberships, permissions, audit events, client shells, shared error contracts, tests, and CI. Product workflows remain outside this phase.

Phase 1A adds real authentication and verified workspace selection. Phase 1B adds
organization-owned client identity, directory/search and explicit duplicate review;
see [ADR 0008](adr-0008-client-identity-and-duplicate-review.md).
