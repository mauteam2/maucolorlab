import fixture from "../../../contracts/fixtures/reporting-contract.json";
import { reportSummary } from "@/lib/reporting/model";
import { tenantContextSchema } from "@/lib/tenant/context";
export function reportingFixture() {
  return { snapshot: reportSummary.parse(structuredClone(fixture.snapshot)), context: tenantContextSchema.parse({ membership_id: "b4000000-0000-4000-8000-000000000111", organization_id: fixture.snapshot.organization_id, organization_name: "Synthetic Studio", location_id: fixture.snapshot.location_id, location_name: "Bolu", role: "owner", membership_status: "active", permissions: ["reports.read", "reports.manage", "reports.export", "salon.read", "crm.read", "finance.view", "cost.view", "commission.view_all", "finance.expense.view", "finance.cash.close", "stock.view", "live_session.view", "crm.notes.technical"] }) };
}
