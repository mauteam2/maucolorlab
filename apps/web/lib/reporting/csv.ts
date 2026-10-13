import { type ReportSummary } from "./model";
export function csvCell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function reportCsv(report: ReportSummary) {
  const lines = [["Metric version", "Period start", "Period end exclusive", "Timezone", "Metric", "Value", "Unit", "Denominator", "Status"]];
  for (const m of report.metrics) lines.push(["1", report.period.start, report.period.end, report.period.timezone, m.name, m.value ?? "", m.unit, m.denominator ?? "", m.status]);
  lines.push([], ["Domain", "Source ID", "Time", "Historical label", "Status", "Revenue minor", "Cost minor", "Cost status", "Commission minor", "Contribution minor"]);
  for (const r of report.items) lines.push([r.domain, r.source_id, r.at, r.label ?? "", r.status ?? "", r.revenue_minor ?? "", r.cost_minor ?? "", r.cost_status ?? "", r.commission_minor ?? "", r.contribution_minor ?? ""]);
  return "\ufeff" + lines.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
