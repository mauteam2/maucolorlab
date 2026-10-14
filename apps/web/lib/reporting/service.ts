import "server-only";
import { throwSaasError } from "@/lib/saas/errors";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { workspaceReference } from "@/lib/tenant/context";
import { AccessError } from "@/lib/tenant/bootstrap";
import { permittedReportDomains, reportCommand, reportOperationResult, reportRequest, reportSummary, type ReportRequest, type ReportSummary } from "./model";
import { costingStatus } from "@/lib/costing/service";

const detailKeys: Record<string, string[]> = {
  APPOINTMENT: ["completed_at", "scheduled_minutes", "occupied_minutes", "service_version", "staff_display_name"],
  REVENUE: ["original_net_minor", "service_version", "appointment_id", "live_session_id", "retail_quantity"],
  COMMISSION: ["charge_id", "policy_id", "policy_version", "accrual_minor", "adjustment_minor"],
  CLIENT: ["return_signal", "last_visit_at", "first_visit_at", "future_appointment", "followups", "computed_at", "record_status"],
  STOCK_ITEM: ["threshold", "catalog_product_id", "expiring_lots"], STOCK_MOVEMENT: ["stock_item_id", "reversal_of", "source_event_id", "source_session_id"],
  EXPENSE: [], CASH: ["closed_at", "expected_minor", "counted_minor", "difference_minor"], LIVE: ["outcome_recorded", "recipe_revised", "risk_events"],
};
export async function executeReport(raw: unknown, correlationId: string, reference?: string | null) {
  const write = reference !== undefined;
  const parsed = write ? reportCommand.safeParse(raw) : reportRequest.safeParse(raw);
  if (!parsed.success) throw new AccessError("VALIDATION_FAILED", 400);
  const command = write ? reportCommand.parse(parsed.data) : null;
  const permission = command ? command.type === "EXPORT" ? "reports.export" : "reports.manage" : "reports.read";
  const context = await verifiedClientContext(permission);
  if (write && reference !== workspaceReference(context)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
  const client = await createClient();
  const reply = await client.rpc(write ? "reporting_operation" : "reporting_snapshot", {
    p_membership_id: context.membership_id, p_location_id: context.location_id,
    ...(write ? { p_command: parsed.data, p_correlation_id: correlationId } : { p_request: parsed.data }),
  });
  throwSaasError(reply.error);if (reply.error) throw new AccessError("NETWORK_ERROR", 503);
  const envelope = reply.data as { code?: string; data?: unknown } | null;
  if (envelope?.code) throw new AccessError(envelope.code, costingStatus(envelope.code));
  const snapshot = !write || command?.type === "EXPORT";
  const data = snapshot ? reportSummary.safeParse(envelope?.data) : reportOperationResult.safeParse(envelope?.data);
  if (!data.success) throw new AccessError("NETWORK_ERROR", 503);
  const fresh = await verifiedClientContext(permission);
  if (workspaceReference(fresh) !== workspaceReference(context) || fresh.organization_id !== context.organization_id || fresh.role !== context.role || [...fresh.permissions].sort().join() !== [...context.permissions].sort().join()) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
  if (snapshot) {
    const s = data.data as ReportSummary, q = (command?.type === "EXPORT" ? command.request : parsed.data) as ReportRequest;
    const selfOnly = ["colorist", "assistant"].includes(context.role), permitted = permittedReportDomains(context.permissions, selfOnly);
    if (s.organization_id !== context.organization_id || s.location_id !== context.location_id || s.kind !== (q.kind ?? "OVERVIEW") || s.self_only !== selfOnly || s.allowed_domains.some(d => !permitted.includes(d))) throw new AccessError("NETWORK_ERROR", 503);
    if (selfOnly) {
      const { data: auth, error } = await client.auth.getUser();
      if (error || !auth.user || s.staff_user_id !== auth.user.id || s.items.some(r => r.staff_user_id !== auth.user.id)) throw new AccessError("NETWORK_ERROR", 503);
    }
    for (const m of [...s.metrics, ...s.previous_metrics]) {
      if (!permitted.includes(m.source_domain) || ((m.name.includes("cost") || m.name.includes("contribution") || m.name.includes("coverage")) && !permitted.includes("COST"))) throw new AccessError("NETWORK_ERROR", 503);
      if (m.name.includes("commission") && !m.name.includes("contribution") && !permitted.includes("COMMISSION")) throw new AccessError("NETWORK_ERROR", 503);
    }
    if (s.coverage && !permitted.includes("COST")) throw new AccessError("NETWORK_ERROR", 503);
    for (const row of s.items) {
      if (!permitted.includes(row.domain) || (q.domain && row.domain !== q.domain) || (q.source_id && row.source_id !== q.source_id) || Object.keys(row.details).some(k => !detailKeys[row.domain]?.includes(k))) throw new AccessError("NETWORK_ERROR", 503);
      if (!permitted.includes("COST") && (row.cost_minor !== null || row.cost_status !== null || row.contribution_minor !== null)) throw new AccessError("NETWORK_ERROR", 503);
      if (!permitted.includes("COMMISSION") && (row.commission_minor !== null || row.contribution_minor !== null)) throw new AccessError("NETWORK_ERROR", 503);
      if (!permitted.includes("LIVE") && row.domain === "CLIENT" && "followups" in row.details) throw new AccessError("NETWORK_ERROR", 503);
    }
    if (s.groups.some(g => (!permitted.includes("REVENUE") && g.recognized_net_revenue !== null) || (!permitted.includes("COST") && (g.known_transactions !== null || g.incomplete_transactions !== null || g.contribution !== null)) || (selfOnly && s.kind === "TEAM" && g.id !== s.staff_user_id))) throw new AccessError("NETWORK_ERROR", 503);
  }
  return { data: data.data, context: fresh, correlationId };
}
