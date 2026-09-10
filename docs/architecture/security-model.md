# Security and tenant isolation

The database is the tenant security boundary. Browser and Android filters may improve the interface but do not grant access.

| Data | Authenticated read | Client write | Tenant rule |
| --- | --- | --- | --- |
| Profile | Own row | Own display name and locale only | `auth.uid()` equals profile user ID |
| Organization | Active members | Server operation only | Any active membership in the organization |
| Location | Allowed members | Server operation only | Organization-wide or matching active location membership |
| Membership | Self or authorized staff | Server operation only | Permission evaluated in the membership's scope |
| Roles and permissions | Signed-in users | Migration only | Global reference data; never sourced from client claims |
| Audit event | Authorized owner/manager scope | Trusted server append only | Permission evaluated for organization and location |

Authorization helpers live in the unexposed `app_private` schema. They are `SECURITY DEFINER` only to avoid recursive membership RLS, use an empty search path, resolve `auth.uid()` internally, and grant execution only to `authenticated`. The service role remains server-only.

All public tables enable RLS. `anon` has no table read grants. `authenticated` receives only the operation and columns required by the current slice. Audit update and delete operations are rejected by a database trigger even for privileged sessions; corrections must append new events.

The pgTAP suite proves unauthenticated denial, cross-organization and cross-location isolation, immediate revocation, ownership/role forgery denial, profile column restrictions, scoped audit reads, and audit immutability.

