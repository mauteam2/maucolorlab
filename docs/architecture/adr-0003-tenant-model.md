# ADR 0003: Organization, Location, and Membership tenancy

- Status: Accepted
- Date: 2026-09-10

## Decision

Use shared multi-tenant tables with explicit `organization_id` and, where relevant, `location_id`. An organization defines base currency; a location defines timezone. A salon membership grants either organization-wide access (`location_id` is null) or access to one location.

## Consequences

The V1 interface may present one location while the model supports multiple locations and organizations. Composite foreign keys prevent a row from pairing an organization with another organization's location. RLS derives access from active memberships and removes it immediately after revocation.

