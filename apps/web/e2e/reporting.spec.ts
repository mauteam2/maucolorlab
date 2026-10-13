import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";
import { reportSummary } from "@/lib/reporting/model";
test.use({ actionTimeout: 20000 });
const now = () => new Date().toISOString();
async function setup(page: Page, revenue = true) {
  const account = await seedAccount(); await login(page, account); await expectReady(page);
  const ctx = (await (await page.request.get("/api/session")).json()).context;
  const headers = { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${ctx.membership_id}:${ctx.location_id}` };
  const call = async (route: string, q: object) => { const r = await page.request.post(route, { headers, data: { mutation_id: randomUUID(), ...q } }); expect(r.status(), await r.text()).toBe(200); return (await r.json()).data; };
  const cr = await page.request.post("/api/clients", { headers, data: { operation: "create", payload: { full_name: "Sentetik rapor müşterisi", phone: "05321110001", phone_region: "TR", request_id: randomUUID() } } }); expect(cr.status()).toBe(200);
  const client = (await cr.json()).data;
  await call("/api/finance", { type: "CURRENCY_SET", currency: "TRY", expected_version: 0, reason: "Disposable report fixture" });
  const charge = randomUUID();
  if (revenue) await call("/api/finance", { type: "MANUAL_CHARGE", id: charge, client_id: client.id, currency: "TRY", amount_minor: "10000", tax_rate_bps: 0, tax_inclusive: true, description: "Recorded report service", occurred_at: now(), reason: "Posted source revenue" });
  return { account, ctx, headers, client, charge, call };
}
async function snapshot(page: Page, query = "") { const r = await page.request.get("/api/reporting" + (query ? "?" + query : "")); expect(r.status(), await r.text()).toBe(200); return reportSummary.parse((await r.json()).data); }
async function open(page: Page) { await page.goto("/workspace/reports"); await expect(page.getByRole("heading", { name: "Salon raporları", exact: true })).toBeVisible(); await expect(page.getByText(/Okuma modeli güncel/)).toBeVisible(); }
function metric(s: Awaited<ReturnType<typeof snapshot>>, name: string) { return s.metrics.find(m => m.name === name)?.value; }
test("owner overview uses posted revenue, not deposits, and exposes unknown cost", async ({ page }) => {
  const f = await setup(page); await f.call("/api/finance", { type: "DEPOSIT", id: randomUUID(), client_id: f.client.id, currency: "TRY", amount_minor: "4000", method: "CARD", appointment_id: null, external_reference: null, occurred_at: now(), reason: "Credit, not revenue" });
  const s = await snapshot(page); expect(metric(s, "recognized_net_revenue")).toBe("10000"); expect(metric(s, "unknown_transactions")).toBe("1"); expect(metric(s, "contribution_after_commission")).toBeNull(); await open(page); await expect(page.getByText("100,00 TRY", { exact: true })).toBeVisible(); await expect(page.getByText("Hesaplanamıyor", { exact: true }).first()).toBeVisible();
});
test("period switch and exact compared dates handle no previous revenue safely", async ({ page }) => {
  await setup(page); await open(page); const first = await snapshot(page); expect(first.comparison.find(c => c.name === "recognized_net_revenue")?.percentage_delta_bps).toBeNull();
  await page.getByLabel("Dönem", { exact: true }).selectOption("LAST_MONTH"); await expect(page.getByText("0,00 TRY", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Dönem", { exact: true }).selectOption("THIS_MONTH"); await expect(page.getByText("100,00 TRY", { exact: true })).toBeVisible(); await expect(page.getByText(new RegExp(first.period.previous_first_date))).toBeVisible();
});
test("custom local-calendar period is bounded and uses half-open instants", async ({ page }) => {
  await setup(page); await open(page); await page.getByLabel("Dönem", { exact: true }).selectOption("CUSTOM"); await page.getByLabel("Başlangıç", { exact: true }).fill("2026-01-01"); await page.getByLabel("Son gün (dahil)").fill("2026-01-01");
  await expect(page.getByText(/2026-01-01 – 2026-01-02/)).toBeVisible(); const s = await snapshot(page, "period=CUSTOM&from=2026-01-01&until=2026-01-01"); expect(Date.parse(s.period.start)).toBe(Date.parse("2025-12-31T21:00:00Z")); expect(s.period.previous_first_date).toBe("2025-12-31"); expect(metric(s, "known_revenue_coverage_bps")).toBeNull();
  expect((await page.request.get("/api/reporting?period=CUSTOM&from=2026-01-01&until=2026-04-01")).status()).toBe(400);
});
test("appointment, client, service and team reports are real permission-scoped views", async ({ page }) => {
  await setup(page); await open(page);
  for (const [kind, label] of [["APPOINTMENTS", "Randevular"], ["CLIENTS", "Müşteriler"], ["SERVICES", "Hizmetler"], ["TEAM", "Ekip"]] as const) {
    await page.getByRole("button", { name: label, exact: true }).click(); await expect(page.getByText(/Okuma modeli güncel/)).toBeVisible(); const s = await snapshot(page, "kind=" + kind); expect(s.kind).toBe(kind);
    if (kind === "CLIENTS") await expect(page.getByText("Sentetik rapor müşterisi", { exact: true })).toBeVisible();
  }
});
test("finance report updates exact contribution and refund once", async ({ page }) => {
  const f = await setup(page); await f.call("/api/costing", { type: "DECLARE_NO_STOCK", charge_id: f.charge, reason: "Reviewed no product use" });
  const payment = randomUUID(); await f.call("/api/finance", { type: "PAYMENT", id: payment, client_id: f.client.id, currency: "TRY", amount_minor: "10000", method: "CARD", appointment_id: null, external_reference: null, occurred_at: now(), allocations: [{ charge_id: f.charge, amount_minor: "10000" }], confirm_credit: false, reason: "Real collection" });
  await f.call("/api/finance", { type: "REFUND", id: randomUUID(), original_payment_id: payment, amount_minor: "5000", occurred_at: now(), reason: "Actual half refund" });
  const s = await snapshot(page, "kind=FINANCE"); expect(metric(s, "recognized_net_revenue")).toBe("5000"); expect(metric(s, "refunds_net")).toBe("5000"); expect(metric(s, "contribution_after_commission")).toBe("5000"); expect(s.coverage?.revenue_bps).toBe("10000");
  await open(page); await page.getByRole("button", { name: "Finans ve katkı", exact: true }).click(); await expect(page.getByRole("heading", { name: "Komisyon sonrası operasyonel katkı", exact: true })).toBeVisible();
});
test("stock alerts and technical report use existing source semantics", async ({ page }) => {
  const f = await setup(page); await f.call("/api/stock", { type: "ENABLE", reason: "Measured inventory" }); const item = randomUUID();
  await f.call("/api/stock", { type: "ITEM_SAVE", id: item, expected_version: 0, definition: { source: "SALON_CUSTOM_OPERATIONAL_PRODUCT", catalog_product_id: null, product_type: "OTHER", display_name: "Sentetik düşük stok", sku: null, barcode: null, inventory_unit: "UNIT", active: true, track_quantity: true, lot_required: false, low_threshold: 10 }, reason: "Operational source" });
  await f.call("/api/stock", { type: "OPENING", stock_item_id: item, lot_id: null, quantity: 5, unit: "UNIT", occurred_at: now(), reference: null, reason: "Measured opening" });
  expect(metric(await snapshot(page, "kind=STOCK"), "low_stock")).toBe("1"); await open(page); await page.getByRole("button", { name: "Stok", exact: true }).click(); await expect(page.locator('[data-source-domain="STOCK_ITEM"]').getByText("Sentetik düşük stok", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Teknik", exact: true }).click(); await expect(page.getByRole("heading", { name: "Kaydedilmiş sonuçlar", exact: true })).toBeVisible();
});
test("reception has no acquisition costs, commissions or restricted technical report", async ({ page, browser }) => {
  const f = await setup(page), member = await f.account.addMember("reception"), context = await browser.newContext(), p = await context.newPage();
  try { await login(p, member); await expectReady(p); await open(p); const s = await snapshot(p); expect(s.allowed_domains).not.toContain("COST"); expect(s.allowed_domains).not.toContain("COMMISSION"); expect(s.allowed_domains).not.toContain("LIVE"); expect(s.coverage).toBeNull();
    await expect(p.getByRole("button", { name: "CSV dışa aktar" })).toHaveCount(0); await expect(p.getByRole("button", { name: "Teknik", exact: true })).toHaveCount(0); expect((await p.request.get("/api/reporting?kind=TECHNICAL")).status()).toBe(403);
  } finally { await context.close(); }
});
test("colorist sees own facts and cannot forge a colleague filter", async ({ page, browser }) => {
  const f = await setup(page), member = await f.account.addMember("colorist"), context = await browser.newContext(), p = await context.newPage();
  try { await login(p, member); await expectReady(p); await open(p); const s = await snapshot(p); expect(s.self_only).toBe(true); expect(s.staff_user_id).not.toBe(f.account.userId); expect(s.items).toHaveLength(0); expect((await p.request.get("/api/reporting?staff_user_id=" + f.account.userId)).status()).toBe(403); await expect(p.getByText("Yalnızca kendi kayıtlarınız", { exact: false })).toBeVisible(); }
  finally { await context.close(); }
});
test("bounded source drill down opens the authoritative cost provenance", async ({ page }) => {
  const f = await setup(page); await page.goto(`/workspace/reports?kind=FINANCE&domain=REVENUE&source_id=${f.charge}`); await expect(page.getByText(/Okuma modeli güncel/)).toBeVisible(); await page.getByRole("link", { name: "Kaydı aç →", exact: true }).click(); await expect(page.getByRole("heading", { name: "Nasıl hesaplandı?", exact: true })).toBeVisible();
});
test("authorized CSV neutralizes source formula prefixes and rebuild is audited", async ({ page }) => {
  const f = await setup(page); const cr = await page.request.post("/api/clients", { headers: f.headers, data: { operation: "create", payload: { full_name: "=SUM(A1:A2)", phone: "05321110002", phone_region: "TR", request_id: randomUUID() } } }); expect(cr.status()).toBe(200);
  const rebuilt = await page.request.post("/api/reporting", { headers: f.headers, data: { type: "REBUILD" } }); expect(rebuilt.status(), await rebuilt.text()).toBe(200);
  const exported = await page.request.post("/api/reporting", { headers: f.headers, data: { type: "EXPORT", request: { kind: "CLIENTS" } } }); expect(exported.status(), await exported.text()).toBe(200); expect(exported.headers()["content-type"]).toContain("text/csv"); expect(await exported.text()).toContain('"\'=SUM(A1:A2)"');
});
test("320px and desktop keep exact metrics readable and show useful empty states", async ({ page }, info) => {
  await setup(page, false); await open(page); expect(metric(await snapshot(page), "known_revenue_coverage_bps")).toBeNull();
  await page.getByRole("button", { name: "Finans ve katkı", exact: true }).click(); await expect(page.getByText("Bu görünümde kayıt yok.")).toBeVisible();
  for (const [width, name] of [[1440, "desktop"], [320, "mobile-320"]] as const) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: info.outputPath(`reporting-empty-${name}.png`), fullPage: true }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
});
