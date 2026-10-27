import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { salonFixture, salonId } from "@/test/salon-fixtures";
import { reportingFixture } from "@/test/reporting-fixtures";
import { TodayDashboard } from "./today-dashboard";
import { dayAppointments, nextAppointment } from "./today-data";
import type { ActiveTenantContext } from "@/lib/tenant/context";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup(role: ActiveTenantContext["role"] = "owner") {
  const f = salonFixture(); f.snapshot.evaluated_at = "2026-10-12T07:15:00Z";
  const context: ActiveTenantContext = { ...f.context, role, permissions: role === "reception" ? ["salon.read", "clients.read", "crm.read"] : [...f.context.permissions, "color_plan.read", "reports.read", "finance.view", "crm.read", "crm.notes.technical", "clients.create"] };
  const report = reportingFixture().snapshot;
  Object.assign(report, { organization_id: context.organization_id, location_id: context.location_id });
  const preparation = { appointment_id: f.a.id, appointment_version: 1, evaluated_at: f.snapshot.evaluated_at, statuses: ["INFORMATION_REQUIRED"], reasons: ["HAIR_PASSPORT_MISSING"], risk: null, freshness: { state: "MISSING", updated_at: null }, recovery: "NOT_ASSESSED", complexity: "UNKNOWN", integrity_history: [], recent_technical_history: [], last_formula: null, last_outcome: null, duration: { source: "SERVICE_DEFAULT", sample_count: 0, estimated_minutes: 60, allocated_minutes: 60, additional_minutes: 0 }, competencies: [], recipe_created: false };
  const action = { id: salonId(401), organization_id: context.organization_id, location_id: context.location_id, client_id: f.a.client_id, kind: "REBOOK", source_domain: "salon_appointment", source_id: f.a.id, basis: {}, status: "OPEN", effective_status: "OPEN", due_at: f.snapshot.evaluated_at, snoozed_until: null, version: 1, created_at: f.snapshot.evaluated_at, updated_at: f.snapshot.evaluated_at, created_by: salonId(21), updated_by: salonId(21) };
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ context, data: url.startsWith("/api/reporting") ? report : url.startsWith("/api/crm") ? { items: [action], has_more: false, offset: 0 } : url.endsWith("/precheck") ? preparation : f.snapshot })));
  vi.stubGlobal("fetch", fetcher);
  return { ...f, context, fetcher, report, preparation, action };
}
it("uses authoritative status before planned time and excludes terminal appointments from next", () => {
  const f = salonFixture(), later = { ...f.a, id: salonId(302), start_at: "2026-10-12T08:00:00Z", end_at: "2026-10-12T09:00:00Z" };
  expect(nextAppointment([{ ...f.a, status: "CANCELLED" }, later], "2026-10-12T07:30:00Z")?.id).toBe(later.id);
  expect(nextAppointment([later, { ...f.a, status: "IN_SERVICE" }], "2026-10-12T12:00:00Z")?.id).toBe(f.a.id);
  expect(nextAppointment([{ ...f.a, status: "COMPLETED" }], "2026-10-12T06:00:00Z")).toBeNull();
});
it("selects the salon local day across a UTC date boundary and sorts its time rail", () => {
  const f = salonFixture(), early = { ...f.a, id: salonId(302), start_at: "2026-10-11T22:30:00Z" };
  f.snapshot.appointments = [f.a, early, { ...f.a, id: salonId(303), start_at: "2026-10-12T22:30:00Z" }];
  expect(dayAppointments(f.snapshot, "2026-10-11T22:00:00Z").map(a => a.id)).toEqual([early.id, f.a.id]);
});
it("shows a real next appointment, factual preparation and read-only action links", async () => {
  const f = setup(); render(<TodayDashboard context={f.context} />);
  const next = await screen.findByRole("region", { name: "Şimdi ve sırada" });
  await waitFor(() => expect(within(next).getByRole("heading", { name: "Synthetic client" })).toBeVisible());
  expect(within(next).getByText("Sırada")).toBeVisible();
  expect(within(next).getByText("10:00")).toBeVisible();
  expect(within(next).getByRole("link", { name: /ColorLab/ })).toHaveAttribute("href", `/workspace/colorlab?client_id=${f.a.client_id}`);
  await waitFor(() => expect(within(next).getByText("Hair Passport eksik")).toBeVisible());
  expect(screen.getByText("Yeniden randevu")).toBeVisible();
  expect(screen.getByRole("link", { name: /Güncel profili incele/ })).toHaveAttribute("href", `/workspace/clients/${f.a.client_id}`);
  expect(f.fetcher.mock.calls.filter(([url]) => url.endsWith("/precheck"))).toHaveLength(1);
});
it("does not request or expose technical or owner business data to reception", async () => {
  const f = setup("reception"); render(<TodayDashboard context={f.context} />);
  await screen.findByRole("heading", { name: "Synthetic client" });
  expect(screen.queryByText("Teknik hazırlık")).toBeNull();
  expect(screen.queryByText("İşletme bağlamı")).toBeNull();
  expect(screen.queryByRole("link", { name: /ColorLab/ })).toBeNull();
  expect(f.fetcher.mock.calls.some(([url]) => url.includes("precheck") || url.includes("reporting"))).toBe(false);
});
it("conceals agenda/action/preparation on privacy lock", async () => {
  const f = setup(); render(<TodayDashboard context={f.context} />);
  await screen.findByRole("heading", { name: "Synthetic client" });
  fireEvent(window, new Event("elifora-offline-lock"));
  expect(screen.queryByRole("heading", { name: "Synthetic client" })).toBeNull();
  expect(screen.queryByText("Yeniden randevu")).toBeNull();
  await act(async () => {});
  expect(screen.queryByText("Hair Passport eksik")).toBeNull();
});
it("ignores a successful late response after privacy lock", async () => {
  const f = setup();
  let resolve!: (response: Response) => void;
  f.fetcher.mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  render(<TodayDashboard context={{ ...f.context, permissions: ["salon.read"] }} />);
  fireEvent(window, new Event("elifora-offline-lock"));
  await act(async () => { resolve(new Response(JSON.stringify({ data: f.snapshot, context: f.context }))); });
  expect(screen.queryByText("Synthetic client")).toBeNull();
});
it("never accepts a foreign workspace snapshot", async () => {
  const f = setup(); f.snapshot.appointments[0]!.location_id = salonId(99);
  render(<TodayDashboard context={f.context} />);
  await screen.findByText("Günün ajandası alınamadı.");
  expect(screen.queryByText("Synthetic client")).toBeNull();
});
it("shows a compact empty agenda without fabricated next service or technical count", async () => {
  const f = setup(); f.snapshot.appointments = [];
  render(<TodayDashboard context={f.context} />);
  await screen.findByText("Bugün henüz randevu yok.");
  expect(screen.getByText("0/0 kontrol alındı")).toBeVisible();
  expect(screen.queryByText("Hair Passport eksik")).toBeNull();
  expect(screen.queryByRole("link", { name: "Randevuyu aç" })).toBeNull();
});
