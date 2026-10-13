// Run with Node 24; source schemas are shared with Web runtime validation.
import { writeFileSync } from "node:fs";
import { z } from "../apps/web/node_modules/zod/index.js";
import * as m from "../apps/web/lib/reporting/model.ts";
const names = {
  ReportPeriodKind: m.reportPeriodKind, ReportKind: m.reportKind, ReportDomain: m.reportDomain,
  ReportPeriod: m.reportPeriod, ReportComparison: m.reportComparison, MetricValue: m.metricValue,
  MetricCoverage: m.metricCoverage, ReportSummary: m.reportSummary, ReportFreshness: m.reportFreshness,
  ReportItem: m.reportItem, ReportRequest: m.reportRequest, ReportCommand: m.reportCommand, SalonInsight: m.salonInsight,
};
const schemas = Object.fromEntries(Object.entries(names).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "draft-2020-12" })]));
for (const [name, kind] of Object.entries({ AppointmentReport: "APPOINTMENTS", ClientReport: "CLIENTS", ServiceReport: "SERVICES", StaffReport: "TEAM", FinanceReport: "FINANCE", StockReport: "STOCK", TechnicalReport: "TECHNICAL" })) {
  const shape = structuredClone(schemas.ReportSummary); shape.properties.kind = { type: "string", const: kind }; schemas[name] = shape;
}
writeFileSync(new URL("../contracts/reporting.schemas.json", import.meta.url), JSON.stringify(schemas, null, 2) + "\n");
const organization_id = "b4000000-0000-4000-8000-000000000001", location_id = "b4000000-0000-4000-8000-000000000011";
const metric = (name, value, unit, source_domain, denominator = null) => ({ name, value, unit, denominator, status: value === null ? "UNAVAILABLE" : "KNOWN", source_domain });
const snapshot = {
  organization_id, location_id, kind: "OVERVIEW", self_only: false, staff_user_id: null, currency: "TRY",
  period: { kind: "THIS_MONTH", timezone: "Europe/Istanbul", start: "2026-09-30T21:00:00Z", end: "2026-10-31T21:00:00Z", first_date: "2026-10-01", end_date_exclusive: "2026-11-01", previous_start: "2026-08-31T21:00:00Z", previous_end: "2026-09-30T21:00:00Z", previous_first_date: "2026-09-01", previous_end_date_exclusive: "2026-10-01" },
  freshness: { status: "CURRENT", updated_at: "2026-10-13T12:00:00Z", last_rebuilt_at: null, watermark: "10", pending_events: "0", metric_version: 1 },
  allowed_domains: ["APPOINTMENT", "CLIENT", "REVENUE", "COST", "COMMISSION", "EXPENSE", "CASH", "STOCK_ITEM", "STOCK_MOVEMENT", "LIVE"],
  metrics: [metric("completed_visits", "1", "COUNT", "APPOINTMENT", "2"), metric("recognized_net_revenue", "100000", "MONEY", "REVENUE"), metric("known_revenue_coverage_bps", "0", "BPS", "REVENUE", "100000"), metric("unknown_transactions", "1", "COUNT", "REVENUE", "1"), metric("contribution_after_commission", null, "MONEY", "REVENUE")],
  previous_metrics: [metric("recognized_net_revenue", "0", "MONEY", "REVENUE")],
  comparison: [{ name: "recognized_net_revenue", current: "100000", previous: "0", absolute_delta: "100000", percentage_delta_bps: null }],
  items: [{ domain: "REVENUE", source_id: "c5000000-0000-4000-8000-000000000301", at: "2026-10-13T10:00:00Z", label: "Stored historical service", status: "SERVICE", client_id: "b4000000-0000-4000-8000-000000000031", staff_user_id: "b4000000-0000-4000-8000-000000000021", service_id: null, category: "CARE", quantity: null, unit: null, duration_seconds: null, revenue_minor: "100000", cost_minor: "0", cost_status: "UNKNOWN", commission_minor: "0", contribution_minor: null, details: { original_net_minor: "100000", appointment_id: null, live_session_id: null, retail_quantity: null, service_version: null } }],
  groups: [], insights: [{ code: "unknown_transactions", value: "1", metric: "unknown_transactions", source_domain: "REVENUE", calculation: "Recorded source count; no prediction", threshold: null }], next_cursor: null,
  coverage: { known: "0", partial: "0", unknown: "1", eligible: "1", count_bps: "0", revenue_bps: "0" },
};
m.reportSummary.parse(snapshot);
writeFileSync(new URL("../contracts/fixtures/reporting-contract.json", import.meta.url), JSON.stringify({ snapshot, request: { kind: "OVERVIEW", period: "THIS_MONTH" }, command: { type: "REBUILD" } }, null, 2) + "\n");
