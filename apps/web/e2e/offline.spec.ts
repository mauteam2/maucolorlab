import { test, expect } from "./reliability-test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";
test.use({ actionTimeout: 20000 });
async function setup(page: Page) {
 const account = await seedAccount(); await login(page, account); await expectReady(page);
 const context = (await (await page.request.get("/api/session")).json()).context;
 const headers = { origin: "http://127.0.0.1:4173", "X-Workspace-Reference": `${context.membership_id}:${context.location_id}` };
 const client = await page.request.post("/api/clients", { headers, data: { operation: "create", payload: { full_name: "Synthetic Offline Client", phone: "05321117788", request_id: randomUUID() } } });
 expect(client.status()).toBe(200); const id = (await client.json()).data.id;
 const path = `/api/clients/${id}/hair-passport`;
 expect((await page.request.post(path, { headers, data: { request_id: randomUUID() } })).status()).toBe(200);
 const vaultReady = page.waitForResponse(r => r.url().includes("/api/offline-context") && r.status() === 200);
 await page.goto(`/workspace/clients/${id}/hair-passport`); await vaultReady;
 await expect(page.getByRole("button", { name: "Genel durumu düzenle" })).toBeVisible();
 await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === "elifora-offline-intents"))).toBe(true);
 return { account, context, headers, id, path };
}
async function edit(page: Page, value: string) {
 await page.getByRole("button", { name: "Genel durumu düzenle" }).click();
 const form = page.locator(".hp-editor");
 await form.getByLabel("Doğal seviye · Bilgi durumu").selectOption("KNOWN");
 await form.getByLabel("Doğal seviye · Değer").fill(value);
 return form;
}
async function online(page: Page) { await page.context().setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online"))); }
async function offline(page: Page) { await page.context().setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline"))); }
async function storageShape(page: Page) {
 return page.evaluate(() => new Promise<{ count: number; plaintext_payload: boolean; persisted_key: boolean }>((resolve, reject) => {
  const request = indexedDB.open("elifora-offline-intents"); request.onerror = () => reject(new Error("Draft database inaccessible"));
  request.onsuccess = () => { const db = request.result; const read = db.transaction("drafts").objectStore("drafts").getAll();
   read.onsuccess = () => { resolve({ count: read.result.length, plaintext_payload: read.result.some(row => "payload" in row || "command" in row), persisted_key: read.result.some(row => "encryption_key" in row || "key_material" in row) }); db.close(); };
  };
 }));
}
test("controlled offline Hair edit stores ciphertext and commits original version on explicit sync", async ({ page }, info) => {
 test.setTimeout(120000); await page.setViewportSize(info.project.name === "chromium" ? { width: 1440, height: 1000 } : { width: 320, height: 800 });
 const f = await setup(page), form = await edit(page, "6");
 const started = Date.now(); await offline(page); await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 const saveMs = Date.now() - started, shape = await storageShape(page);
 expect(shape).toMatchObject({ count: 1, plaintext_payload: false, persisted_key: false });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath("phase-8-offline-hair.png"), fullPage: true });
 await online(page); await expect(page.getByRole("heading", { name: "Synthetic Offline Client" })).toBeVisible();
 const accepted = page.waitForResponse(r => new URL(r.url()).pathname === f.path && r.request().method() === "PATCH");
 const syncAt = Date.now(); await page.getByRole("button", { name: "Taslakları senkronize et" }).click();
 const response = await accepted; expect(response.status()).toBe(200);
 expect(response.request().postDataJSON().expected_version).toBe(1);
 await expect(page.locator("#hp-core")).toContainText("6"); await expect(page.locator(".hp-editor")).toHaveCount(0);
 await page.screenshot({ path: info.outputPath("phase-8-synced-hair.png"), fullPage: true });
 await info.attach("phase-8-draft-performance", { body: Buffer.from(JSON.stringify({ draft_save_ms: saveMs, explicit_sync_and_readback_ms: Date.now() - syncAt })), contentType: "application/json" });
 await f.account.cleanup();
});
test("offline Hair conflict preserves original intent and never rebases onto concurrent edit", async ({ page }, info) => {
 test.setTimeout(120000); const f = await setup(page), form = await edit(page, "8");
 await offline(page); await form.getByRole("button", { name: "Kaydet" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 const changed = await page.request.patch(f.path, { headers: f.headers, data: { request_id: randomUUID(), expected_version: 1, technical: { natural_level: { state: "KNOWN", value: 5 } } } });
 expect(changed.status()).toBe(200); await online(page);
 await expect(page.getByRole("heading", { name: "Synthetic Offline Client" })).toBeVisible();
 const rejected = page.waitForResponse(r => new URL(r.url()).pathname === f.path && r.request().method() === "PATCH");
 await page.getByRole("button", { name: "Taslakları senkronize et" }).click(); expect((await rejected).status()).toBe(409);
 await expect(page.getByText("Çakışma · inceleyin")).toBeVisible(); await expect(page.locator("#hp-core")).toContainText("5");
 await page.getByText("Taslağı incele").click(); await expect(page.locator("pre")).toContainText('"expected_version": 1');
 await page.screenshot({ path: info.outputPath("phase-8-offline-conflict.png"), fullPage: true }); await f.account.cleanup();
});
test("accepted Hair append with lost response replays once after browser reload", async ({ page }, info) => {
 test.setTimeout(120000); const f = await setup(page);
 await page.getByRole("button", { name: "Geçmiş Kaydı Ekle" }).click(); const form = page.locator(".hp-history-editor");
 await form.getByLabel("İşlem açıklaması / teknik not").fill("Synthetic commit without response");
 let committed = false, originalId = "";
 await page.route(`**${f.path}/history`, async route => {
  if (route.request().method() !== "POST" || committed) { await route.continue(); return; }
  originalId = route.request().postDataJSON().request_id;
  const accepted = await route.fetch(); expect(accepted.status()).toBe(200); committed = true;
  await route.abort("connectionclosed");
 });
 await form.getByRole("button", { name: "Kaydet" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 await page.unroute(`**${f.path}/history`); await page.reload();
 await expect(page.getByRole("heading", { name: "Synthetic Offline Client" })).toBeVisible();
 await expect(page.getByRole("button", { name: "Taslakları senkronize et" })).toBeVisible();
 const replay = page.waitForResponse(r => new URL(r.url()).pathname === `${f.path}/history` && r.request().method() === "POST");
 await page.getByRole("button", { name: "Taslakları senkronize et" }).click(); const response = await replay;
 expect(response.status()).toBe(200); expect(response.request().postDataJSON().request_id).toBe(originalId);
 const snapshot = await (await page.request.get(f.path)).json();
 expect(snapshot.data.history.items.filter((r: { description: string }) => r.description === "Synthetic commit without response")).toHaveLength(1);
 await page.screenshot({ path: info.outputPath("phase-8-durable-append-replay.png"), fullPage: true }); await f.account.cleanup();
});
test("signout retains encrypted intent but another account cannot reveal it", async ({ page }) => {
 test.setTimeout(120000); const f = await setup(page), form = await edit(page, "7");
 await offline(page); await form.getByRole("button", { name: "Kaydet" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 await online(page); await page.goto("/workspace"); await expectReady(page);
 await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toBeVisible();
 await page.getByRole("button", { name: "Oturumu kapat" }).click(); await expect(page).toHaveURL(/sign-in/);
 const other = await seedAccount(); await login(page, other); await expectReady(page);
 await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toHaveCount(0);
 expect((await storageShape(page)).count).toBe(1);
 await page.getByRole("button", { name: "Oturumu kapat" }).click(); await expect(page).toHaveURL(/sign-in/);
 await login(page, f.account); await expectReady(page);
 await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toBeVisible();
 await f.account.cleanup(); await other.cleanup();
});
test("revoked authority rejects captured sync without exposing cached technical data", async ({ page }) => {
 test.setTimeout(120000); const f = await setup(page), form = await edit(page, "7");
 await offline(page); await form.getByRole("button", { name: "Kaydet" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 await f.account.revoke(); await online(page); await expect(page).toHaveURL(/workspaces/);
 expect((await page.request.get(`/api/offline-context?device_id=${randomUUID()}`)).status()).toBe(403);
 expect((await page.request.patch(f.path, { headers: f.headers, data: { request_id: randomUUID(), expected_version: 1, technical: { natural_level: { state: "KNOWN", value: 7 } } } })).status()).toBe(403);
 await expect(page.getByText("Synthetic Offline Client")).toHaveCount(0); await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toHaveCount(0);
 await f.account.cleanup();
});
