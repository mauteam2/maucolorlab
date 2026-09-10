# ADR 0002: Supabase with a server-side service boundary

- Status: Accepted
- Date: 2026-09-10

## Decision

Use Supabase Auth, PostgreSQL, RLS, private Storage, and selective Realtime. Allow clients only the narrow direct data access explicitly protected by grants and RLS. Route critical domain and financial mutations through server-side services that resolve membership and authorization independently of client claims.

## Consequences

Service-role credentials never enter Android or browser builds. RLS still protects direct reads and non-critical operations. The service layer must return typed errors and correlation IDs and must append audit events for critical work.

