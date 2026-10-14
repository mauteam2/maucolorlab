import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { seedAccount, login, expectReady } from "./local-auth";

function sql(text: string) {
  const status = JSON.parse(readFileSync(process.env.ELIFORA_TEST_STATUS_FILE!, "utf8"));
  if (status.API_URL !== "http://127.0.0.1:54321") throw new Error("Disposable local database required");
  return execFileSync("docker", ["exec", "-i", "supabase_db_elifora", "psql", "-XAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8" }).trim();
}
async function setup(page: Page) {
  const account = await seedAccount(); await login(page, account); await expectReady(page);
  const ctx = (await (await page.request.get("/api/session")).json()).context;
  const headers = { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${ctx.membership_id}:${ctx.location_id}` };
  return { account, ctx, headers };
}
function configure(org: string, state = "ACTIVE", stock = true, locations: number | null = null) {
  if (!/^[a-f0-9-]{36}$/.test(org) || !["ACTIVE", "SUSPENDED"].includes(state)) throw new Error("Invalid synthetic control input");
  const q = JSON.stringify({ type: "PLAN_VERSION", code: "PLAN_B", label: "PLAN_B", development_only: true, entitlements: Object.fromEntries(["COLOR_ENGINE", "BRAND_ADAPTER", "LIVE_SESSION", "CRM", "STOCK", "FINANCE", "COSTING", "COMMISSION", "REPORTING", "AI_GATEWAY"].map(c => [c, c !== "STOCK" || stock])), quotas: { LOCATIONS: locations, ACTIVE_MEMBERS: null, ENGINE_EXECUTIONS: null, STORAGE_BYTES: null } });
  sql(`begin;select pg_advisory_xact_lock_shared(hashtextextended('${org}',0));select pg_advisory_xact_lock(hashtextextended('${org}:saas',71));select pg_advisory_xact_lock(hashtextextended('saas-plan:PLAN_B',72));
  do $$declare p uuid;begin
  p:=(app_private.saas_control('${org}','${q}'::jsonb||jsonb_build_object('expected_version',(select coalesce(max(v.version),0) from app_private.saas_plan_versions v join app_private.saas_plans p on p.id=v.plan_id where p.code='PLAN_B')),'E2E_OPERATOR','Disposable entitlement transition',gen_random_uuid())#>>'{data,id}')::uuid;
  perform app_private.saas_control('${org}',jsonb_build_object('type','SUBSCRIPTION','expected_version',(select version from app_private.saas_accounts where organization_id='${org}'),'plan_version_id',p,'status','${state}'),'E2E_OPERATOR','Disposable subscription transition',gen_random_uuid());end$$;commit;`);
}
async function openAccount(page: Page) {
  await page.goto("/workspace/settings/subscription");
  await expect(page.getByRole("heading", { name: "Plan, abonelik ve kullanım", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yapılandırılmış yetenekler", exact: true })).toBeVisible();
}
test("owner subscription, current plan transition, mobile and historical read survive suspension", async ({ page }, info) => {
  const { ctx, headers } = await setup(page); await openAccount(page);
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
  expect((await page.request.get("/api/clients")).status()).toBe(200); expect((await page.request.get("/api/reporting")).status()).toBe(200);
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
