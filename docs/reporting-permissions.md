# ELIFORA reporting permissions and privacy

Reporting does not widen source permissions. `reports.read` only opens the report
boundary; source-domain permissions still decide every metric and row. Membership,
location and organization are resolved from current authenticated database records,
not client IDs, UI visibility or editable JWT metadata.

| View | Required source permission |
| --- | --- |
| Appointments / historical volume and duration | salon.read |
| Canonical client relationship snapshot | crm.read |
| Recognized net revenue | finance.view |
| Acquisition / direct cost, coverage, before-commission contribution | cost.view |
| Team commission / after-commission contribution | commission.view_all |
| Own commission | commission.view_self, forced staff=auth.uid() |
| Expenses | finance.expense.view |
| Cash count/difference | finance.cash.close |
| Stock quantity/alerts/consumption | stock.view |
| Technical aggregate | live_session.view AND crm.notes.technical |
| Projection rebuild / threshold settings | reports.manage |
| Bounded sensitive CSV | reports.export plus all requested source permissions |

Owner/manager defaults expose only source-permitted broad metrics. Colorist and
assistant reports force self scope for appointment, technical and commission
records; they do not inherit broad client, revenue, cost, expense, cash or stock
reports. Reception can read its existing operational/client/revenue/stock scope,
but cannot see acquisition/direct costs, team commission, private notes or
restricted technical projections. Settings are readable only by reports.manage.

The SQL RPC validates organization/location/membership and controlled filters.
Web rechecks membership/permission scope after parsing a strict response and rejects
foreign tenants, unexpected/private detail keys or incorrectly disclosed monetary
fields. Android independently validates exact values, source domains, self scope,
dates and fresh membership before releasing the domain summary. Both conceal data
on workspace switch/background/session revocation; report browser responses are
private/no-store. CSV uses same-origin POST, workspace precondition, permission,
bounded payload, formula-prefix encoding and audited authorized snapshot.

P2 G1-10 is not globally closed. Phase 6 adds a separate minimum-necessary report
projection that intentionally excludes reception technical details. P2 G1-11 is
not globally closed either: the two new reporting RPCs have explicit allow/deny,
scope, schema and exported-contract coverage; older unrelated RPC gaps remain.
