import { configure } from "./saas-test-control";
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";

async function setup(page: Page) {
  const account = await seedAccount(); await login(page, account); await expectReady(page);
  const ctx = (await (await page.request.get("/api/session")).json()).context;
  const headers = { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${ctx.membership_id}:${ctx.location_id}` };
  return { account, ctx, headers };
}
async function openAccount(page: Page) {
  await page.goto("/workspace/settings/subscription");
  await expect(page.getByRole("heading", { name: "Plan, abonelik ve kullanım", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yapılandırılmış yetenekler", exact: true })).toBeVisible();
}
test("owner subscription, current plan transition, mobile and historical read survive suspension", async ({ page }, info) => {
  const { ctx, headers } = await setup(page);
  const created = await page.request.post("/api/clients", { headers, data: { operation: "create", payload: { full_name: "Sentetik abonelik müşterisi", phone: "05329990007", phone_region: "TR", request_id: randomUUID() } } });
  expect(created.status(), await created.text()).toBe(200); const client = (await created.json()).data;
  await openAccount(page);
  await expect(page.getByRole("heading", { name: "Kullanım ve sınırlar" })).toBeVisible();
  const initial = (await (await page.request.get("/api/saas")).json()).data;
  expect(initial.management_allowed).toBe(true); expect(initial.entitlements.every((e: { creation_allowed: boolean }) => e.creation_allowed)).toBe(true);
  configure(ctx.organization_id, "ACTIVE", false);
  await page.getByRole("button", { name: "Yenile", exact: true }).click();
  await expect(page.getByText("Bu özellik mevcut planda yer almıyor.", { exact: true })).toBeVisible();
  const blocked = await page.request.post("/api/stock", { headers, data: { type: "ENABLE", mutation_id: randomUUID(), reason: "Synthetic blocked creation" } });
  expect(blocked.status()).toBe(409); expect((await blocked.json()).code).toBe("FEATURE_UNAVAILABLE");
  configure(ctx.organization_id); await page.getByRole("button", { name: "Yenile", exact: true }).click();
  await expect(page.getByText("Bu özellik mevcut planda yer almıyor.", { exact: true })).toHaveCount(0);
  const current = (await (await page.request.get("/api/saas")).json()).data; expect(current.version).toBeGreaterThan(initial.version);
  for (const [width, label] of [[1440, "desktop"], [320, "mobile-320"]] as const) {
    await page.setViewportSize({ width, height: 900 }); await expect(page.getByRole("heading", { name: "Kullanım ve sınırlar" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`saas-active-${label}.png`), fullPage: true });
  }
  configure(ctx.organization_id, "SUSPENDED"); await page.getByRole("button", { name: "Yenile", exact: true }).click();
  await expect(page.getByText("Askıya alınmış", { exact: true })).toBeVisible();
  const suspended = (await (await page.request.get("/api/saas")).json()).data; expect(suspended.entitlements.every((e: { creation_allowed: boolean }) => !e.creation_allowed)).toBe(true);
  const historical = await page.request.post("/api/clients", { headers, data: { operation: "detail", payload: { client_id: client.id } } });
  expect(historical.status(), await historical.text()).toBe(200); expect((await historical.json()).data.id).toBe(client.id);
  expect((await page.request.get("/api/reporting")).status()).toBe(200);
  await page.screenshot({ path: info.outputPath("saas-suspended-mobile-320.png"), fullPage: true });
});
test("manager gets capability view without billing authority", async ({ page, browser }) => {
  const { account } = await setup(page), manager = await account.addMember("manager");
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  try {
    const other = await context.newPage(); await login(other, manager); await expectReady(other); await openAccount(other);
    await expect(other.getByText("Plan yönetimi ve kuruluş kullanım ayrıntıları kuruluş sahibine açıktır.")).toBeVisible();
    await expect(other.getByRole("heading", { name: "Kullanım ve sınırlar" })).toHaveCount(0);
    const snapshot = (await (await other.request.get("/api/saas")).json()).data; expect(snapshot.management_allowed).toBe(false); expect(snapshot.plan).toBeNull(); expect(snapshot.quotas).toEqual([]);
    const ctx = (await (await other.request.get("/api/session")).json()).context;
    expect((await other.request.post("/api/saas", { headers: { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${ctx.membership_id}:${ctx.location_id}` }, data: { type: "REBUILD_USAGE" } })).status()).toBe(403);
  } finally { await context.close(); }
});
test("one remaining location, exact quota, rejected growth and downgrade preserve facts", async ({ page }, info) => {
  const { ctx, headers } = await setup(page); configure(ctx.organization_id, "ACTIVE", true, 2); await openAccount(page);
  await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
  const create = () => ({ type: "CREATE_LOCATION", request_id: randomUUID(), id: randomUUID(), name: "Sentetik şube", timezone: "Europe/Istanbul" });
  const q = create(), accepted = await page.request.post("/api/saas/structure", { headers, data: q }); expect(accepted.status(), await accepted.text()).toBe(200);
  expect((await page.request.post("/api/saas/structure", { headers, data: q })).status()).toBe(200);
  const rejected = await page.request.post("/api/saas/structure", { headers, data: create() }); expect(rejected.status()).toBe(409); expect((await rejected.json()).code).toBe("QUOTA_EXCEEDED");
  await page.getByRole("button", { name: "Yenile", exact: true }).click(); await expect(page.getByText("2 / 2", { exact: true })).toBeVisible(); await expect(page.getByText("Sınıra ulaşıldı", { exact: true })).toBeVisible();
  configure(ctx.organization_id, "ACTIVE", true, 1); await page.getByRole("button", { name: "Yenile", exact: true }).click();
  await expect(page.getByText("2 / 1", { exact: true })).toBeVisible(); await expect(page.getByText("Yeni sınır aşılıyor; mevcut kayıtlar korunur", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("saas-quota-exceeded-mobile-320.png"), fullPage: true });
});
test("background and offline conceal billing data until a fresh authorized read", async ({ page }) => {
  await setup(page); await openAccount(page); await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByRole("heading", { name: "Kullanım ve sınırlar" })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByRole("heading", { name: "Kullanım ve sınırlar" })).toBeVisible();
  await page.context().setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline"))); await expect(page.getByRole("heading", { name: "Abonelik durumu" })).toHaveCount(0);
  await page.context().setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online"))); await expect(page.getByRole("heading", { name: "Abonelik durumu" })).toBeVisible();
});
