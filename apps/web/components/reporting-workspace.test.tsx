import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { reportingFixture } from "@/test/reporting-fixtures";
import { ReportingWorkspace } from "./reporting-workspace";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function ready() { const f = reportingFixture(); const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: f.snapshot, context: f.context }))); vi.stubGlobal("fetch", fetch); return { f, fetch }; }
it("shows unknown contribution and exact recognized revenue", async () => { ready(); render(<ReportingWorkspace />); expect(await screen.findByText("1.000,00 TRY")).toBeVisible(); expect(screen.getAllByText("Hesaplanamıyor").length).toBeGreaterThan(0); expect(screen.getByText(/Bilinen ürün maliyeti/)).toBeVisible(); });
it("renders location-local compared dates and source links", async () => { ready(); render(<ReportingWorkspace />); expect(await screen.findByText("Stored historical service")).toBeVisible(); expect(screen.getByRole("link", { name: "Kaydı aç →" })).toHaveAttribute("href", "/workspace/finance/profitability?charge_id=c5000000-0000-4000-8000-000000000301"); });
it("reports pending refresh instead of promising real time", async () => { const { f } = ready(); f.snapshot.freshness.status = "PENDING"; f.snapshot.freshness.pending_events = "8"; render(<ReportingWorkspace />); expect(await screen.findByText(/8 kaynak olayı/)).toBeVisible(); });
it("conceals sensitive report data on blur", async () => { ready(); render(<ReportingWorkspace />); await screen.findByText("Stored historical service"); fireEvent.blur(window); expect(screen.queryByText("Stored historical service")).toBeNull(); });
it("has a useful empty state", async () => { const { f } = ready(); f.snapshot.items = []; render(<ReportingWorkspace />); expect(await screen.findByText("Bu görünümde kayıt yok.")).toBeVisible(); });
it("keeps an unavailable report concealed", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 }))); render(<ReportingWorkspace />); expect(await screen.findByRole("alert")).toHaveTextContent("yetkiniz yok"); expect(screen.queryByText("Stored historical service")).toBeNull(); });
