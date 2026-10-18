# RPC/API security inventory

The authoritative review ledger is `contracts/security-inventory.json`. It lists
every current application function in public/app_private (including SECURITY
DEFINER), exported HTTP method including auth routes, server action, storage path
and service-role use. Entries include source hash, domain, auth/membership/location,
permission/command resolver, entitlement, role constraints, access type,
idempotency/audit expectations and existing executable evidence.

`python scripts/security_inventory.py` fails on unclassified or removed surfaces,
changed definitions/signatures and missing evidence. `test-security-inventory.py`
proves new public RPC, private definer, API, action and modified code fail. The
scanner recognizes TypeScript/JavaScript function/const route exports and rejects
unknown route export forms and unsupported/inline server actions;
current function names are not overloaded, and newly changed overloads fail closed.
Review a deliberate API change and update its approved hash and classification.
Never automatically regenerate approvals in CI.

`verify-security-database.py` inspects actual post-migration pg_proc, ACLs, owners,
search_path, table/view/sequence grants, RLS policies, bucket privacy and custom
roles. Runtime names/counts must match the source ledger. PUBLIC cannot execute
application functions; anon/service_role have only the no-data public pre-request hook exception.
Normal authenticated roles have no direct domain table writes; the preexisting
profile display-name/locale column grants are retained. Invoker/writer roles
remain NOLOGIN/NOBYPASSRLS; privileged helpers are constrained by their reviewed
body and caller permission, not by client ownership fields.

API role tests span Hair/Live, operational appointments, CRM, reports/exports,
cost/commission and SaaS. The dedicated Phase 9 E2E gate runs optimized build/start
with retries=0. Existing negative domain/RLS tests remain part of the full suite.
Inventory coverage counts do not imply every input combination was penetration
tested. No external destructive penetration test or compliance certification is
claimed.
