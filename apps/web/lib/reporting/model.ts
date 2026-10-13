import { z } from "zod";

const id = z.uuid(), time = z.iso.datetime({ offset: true }), date = z.iso.date();
export const exactInteger = z.string().regex(/^-?(0|[1-9]\d{0,39})$/);
const quantity = z.string().regex(/^-?\d+(\.\d+)?$/);
export const reportDomain = z.enum(["APPOINTMENT", "REVENUE", "COST", "COMMISSION", "CLIENT", "EXPENSE", "CASH", "STOCK_ITEM", "STOCK_MOVEMENT", "LIVE"]);
export const reportKind = z.enum(["OVERVIEW", "APPOINTMENTS", "CLIENTS", "SERVICES", "TEAM", "FINANCE", "STOCK", "TECHNICAL"]);
export const reportPeriodKind = z.enum(["TODAY", "YESTERDAY", "THIS_WEEK", "LAST_WEEK", "THIS_MONTH", "LAST_MONTH", "CUSTOM"]);
export const reportCursor = z.strictObject({ at: time, id, domain: reportDomain });
export const reportRequest = z.strictObject({
  kind: reportKind.optional(), period: reportPeriodKind.optional(), from: date.optional(), until: date.optional(),
  staff_user_id: id.optional(), service_id: id.optional(), category: z.string().min(1).max(80).optional(),
  cursor: reportCursor.optional(), domain: reportDomain.optional(), source_id: id.optional(),
  segment: z.enum(["RETURNING", "INACTIVE", "OVERDUE", "RETURN_WINDOW_OPEN", "UNKNOWN", "PARTIAL", "KNOWN", "LOW", "OUT"]).optional(),
}).refine(q => q.period === "CUSTOM" ? !!q.from && !!q.until && q.until >= q.from && (Date.parse(q.until) - Date.parse(q.from)) / 86400000 < 90 : !q.from && !q.until);
export type ReportRequest = z.infer<typeof reportRequest>;
export const reportPeriod = z.strictObject({
  kind: reportPeriodKind, timezone: z.string().min(1).max(100), start: time, end: time,
  first_date: date, end_date_exclusive: date, previous_start: time, previous_end: time,
  previous_first_date: date, previous_end_date_exclusive: date,
});
export const metricValue = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), value: quantity.nullable(),
  unit: z.enum(["COUNT", "MONEY", "BPS", "MINUTES", "GRAM", "MILLILITER", "UNIT"]),
  denominator: quantity.nullable(), status: z.enum(["KNOWN", "UNAVAILABLE"]), source_domain: reportDomain,
}).refine(m => (m.status === "KNOWN") === (m.value !== null) && (m.unit !== "MONEY" || m.value === null || exactInteger.safeParse(m.value).success));
export const metricCoverage = z.strictObject({ known: exactInteger, partial: exactInteger, unknown: exactInteger, eligible: exactInteger, count_bps: exactInteger.nullable(), revenue_bps: exactInteger.nullable() });
export const reportComparison = z.strictObject({ name: z.string(), current: quantity.nullable(), previous: quantity.nullable(), absolute_delta: quantity.nullable(), percentage_delta_bps: exactInteger.nullable() });
export const reportFreshness = z.strictObject({ status: z.enum(["CURRENT", "PENDING", "STALE_CALENDAR"]), updated_at: time, last_rebuilt_at: time.nullable(), watermark: exactInteger, pending_events: exactInteger, metric_version: z.literal(1) });
const detail = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
export const reportItem = z.strictObject({
  domain: reportDomain, source_id: id, at: time, label: z.string().nullable(), status: z.string().nullable(),
  client_id: id.nullable(), staff_user_id: id.nullable(), service_id: id.nullable(), category: z.string().nullable(),
  quantity: quantity.nullable(), unit: z.string().nullable(), duration_seconds: exactInteger.nullable(),
  revenue_minor: exactInteger.nullable(), cost_minor: exactInteger.nullable(), cost_status: z.enum(["KNOWN", "PARTIAL", "UNKNOWN"]).nullable(),
  commission_minor: exactInteger.nullable(), contribution_minor: exactInteger.nullable(), details: detail,
}).refine(r => r.cost_status === "KNOWN" || r.contribution_minor === null);
export const reportGroup = z.strictObject({ id, label: z.string().nullable(), count: z.int().nonnegative(), recognized_net_revenue: exactInteger.nullable(), known_transactions: z.int().nonnegative().nullable(), incomplete_transactions: z.int().nonnegative().nullable(), contribution: exactInteger.nullable(), average_duration_seconds: exactInteger.nullable() });
export const salonInsight = z.strictObject({ code: z.string(), value: quantity, metric: z.string(), source_domain: reportDomain, calculation: z.string().max(250), threshold: z.int().min(0).max(10000).nullable() });
export const reportSummary = z.strictObject({
  organization_id: id, location_id: id, kind: reportKind, self_only: z.boolean(), staff_user_id: id.nullable(),
  currency: z.enum(["TRY", "EUR", "USD", "GBP", "JPY", "KWD"]), period: reportPeriod, freshness: reportFreshness,
  allowed_domains: z.array(reportDomain).max(10), metrics: z.array(metricValue).max(100), previous_metrics: z.array(metricValue).max(100),
  comparison: z.array(reportComparison).max(100), items: z.array(reportItem).max(50), groups: z.array(reportGroup).max(50),
  insights: z.array(salonInsight).max(20), next_cursor: reportCursor.nullable(),
});
export type ReportSummary = z.infer<typeof reportSummary>;
export const reportCommand = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("REBUILD") }),
  z.strictObject({ type: z.literal("SETTINGS"), expected_version: z.int().nonnegative(), coverage_warning_bps: z.int().min(0).max(10000).nullable(), cancellation_warning_bps: z.int().min(0).max(10000).nullable() }),
  z.strictObject({ type: z.literal("EXPORT"), request: reportRequest }),
]);
export const reportOperationResult = z.strictObject({ type: z.enum(["REBUILD", "SETTINGS"]), version: z.int().nonnegative() });
export function permittedReportDomains(permissions: string[], selfOnly: boolean) {
  const result: z.infer<typeof reportDomain>[] = [];
  if (permissions.includes("salon.read")) result.push("APPOINTMENT");
  if (!selfOnly && permissions.includes("crm.read")) result.push("CLIENT");
  if (!selfOnly && permissions.includes("finance.view")) result.push("REVENUE");
  if (!selfOnly && permissions.includes("cost.view")) result.push("COST");
  if (permissions.includes(selfOnly ? "commission.view_self" : "commission.view_all")) result.push("COMMISSION");
  if (!selfOnly && permissions.includes("finance.expense.view")) result.push("EXPENSE");
  if (!selfOnly && permissions.includes("finance.cash.close")) result.push("CASH");
  if (!selfOnly && permissions.includes("stock.view")) result.push("STOCK_ITEM", "STOCK_MOVEMENT");
  if (permissions.includes("live_session.view") && permissions.includes("crm.notes.technical")) result.push("LIVE");
  return result;
}
export function reportSourceLink(row: Pick<z.infer<typeof reportItem>, "domain" | "source_id" | "client_id" | "details">) {
  switch (row.domain) {
    case "APPOINTMENT": return `/workspace/appointments?appointment_id=${row.source_id}`;
    case "REVENUE": return `/workspace/finance/profitability?charge_id=${row.source_id}`;
    case "COMMISSION": return "/workspace/commission";
    case "CLIENT": return `/workspace/clients/${row.source_id}`;
    case "STOCK_ITEM": case "STOCK_MOVEMENT": return "/workspace/stock";
    case "EXPENSE": case "CASH": return "/workspace/finance";
    case "LIVE": return row.client_id ? `/workspace/clients/${row.client_id}/live/${row.source_id}` : "/workspace/colorlab";
    default: return "/workspace/reports";
  }
}
// Exact rendering; aggregated money never passes through Number or parseFloat.
export function reportMoney(value: string | null, currency: ReportSummary["currency"]) {
  if (value === null) return "Bilinmiyor";
  const n = BigInt(value), negative = n < 0n, abs = negative ? -n : n;
  const exponent = currency === "JPY" ? 0 : currency === "KWD" ? 3 : 2, scale = 10n ** BigInt(exponent);
  return `${negative ? "−" : ""}${(abs / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${exponent ? "," + (abs % scale).toString().padStart(exponent, "0") : ""} ${currency}`;
}
