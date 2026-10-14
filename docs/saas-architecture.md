# ELIFORA SaaS control plane

Organization remains the tenant and data owner. One private SaaS account points to
an immutable subscription version and immutable plan version. Membership/permission
authorization is checked independently before subscription availability. SaaS does
not grant a domain permission or access to another organization.

The default is UNCONFIGURED: no invented plan, price, trial or billing period. One
initial location and one organization-wide owner can establish the tenant identity;
additional growth requires an explicit current quota configuration. The CI-only
`configure-disposable-saas.py` installs a clearly marked PLAN_A fixture before
synthetic locations; it is not a migration or application bootstrap policy.

Normal clients consume `saas_snapshot` and submit bounded `saas_operation` change
requests/rebuilds. Organization-wide owners can create locations/members through
`saas_structure_operation` with existing domain permissions. Platform plan/state
control and verified provider processing live in private functions granted only to
the separate non-login `elifora_saas_operator`. Salon managers do not become billing
administrators. No live billing provider or commercial checkout is configured.

Source facts, domain authorization, RLS, audit and immutable technical/financial
history retain authority. SaaS usage is not included in salon Finance or Reports.

Disposable browser fixture teardown archives configured tenant locations and
revokes memberships; it does not cascade-delete immutable subscription history.
All existing Auth/RLS assertions remain unchanged, and synthetic history is
removed when the CI database itself is destroyed. Empty unconfigured fixtures
can retain the original physical teardown.
