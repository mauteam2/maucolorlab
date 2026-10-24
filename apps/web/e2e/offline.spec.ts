import { configure, sql } from "./saas-test-control";
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
 const replayAt = Date.now(); await page.getByRole("button", { name: "Taslakları senkronize et" }).click(); const response = await replay;
 expect(response.status()).toBe(200); expect(response.request().postDataJSON().request_id).toBe(originalId);
 const snapshot = await (await page.request.get(f.path)).json();
 expect(snapshot.data.history.items.filter((r: { description: string }) => r.description === "Synthetic commit without response")).toHaveLength(1);
 await info.attach("phase-8-replay-performance", { body: Buffer.from(JSON.stringify({ idempotent_replay_ms: Date.now() - replayAt })), contentType: "application/json" });
 await page.screenshot({ path: info.outputPath("phase-8-durable-append-replay.png"), fullPage: true }); await f.account.cleanup();
});

test("restored draft queue dispatches at most ten original intents per explicit batch", async ({ page }, info) => {
 test.setTimeout(180000); const f = await setup(page);
 await page.getByRole("button", { name: "Geçmiş Kaydı Ekle" }).click(); const form = page.locator(".hp-history-editor");
 await offline(page); const saveAt = Date.now();
 for (let i = 0; i < 11; i++) {
  await form.getByLabel("İşlem açıklaması / teknik not").fill(`Synthetic bounded history ${i}`);
  await form.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(async () => (await storageShape(page)).count).toBe(i + 1);
 }
 const saveMs = Date.now() - saveAt; await online(page); const restoreAt = Date.now(); await page.reload();
 const sync = page.getByRole("button", { name: "Taslakları senkronize et" }); await expect(sync).toBeVisible(); const restoreMs = Date.now() - restoreAt;
 let accepted = 0; page.on("response", response => { if (new URL(response.url()).pathname === `${f.path}/history` && response.request().method() === "POST" && response.status() === 200) accepted++; });
 const firstBatchComplete = page.waitForFunction(() => {
  const panel = document.querySelector('section[aria-label="Yerel taslaklar"]');
  return panel?.getAttribute("aria-busy") === "false" && [...panel.querySelectorAll("p")].some(p => /^1 taslak\. Henüz sunucu kaydı değildir/.test(p.textContent ?? ""));
 });
 const batchAt = Date.now(); await sync.click(); await firstBatchComplete; await expect(page.getByText(/^1 taslak\. Henüz sunucu kaydı değildir/)).toBeVisible();
 await expect(sync).toBeEnabled(); expect(accepted).toBe(10); const batchMs = Date.now() - batchAt;
 await sync.click(); await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toHaveCount(0); expect(accepted).toBe(11);
 const snapshot = await (await page.request.get(`${f.path}?page_size=100`)).json(); expect(snapshot.data.history.items).toHaveLength(11);
 await info.attach("phase-8-batch-performance", { body: Buffer.from(JSON.stringify({ intents: 11, local_capture_total_ms: saveMs, average_local_capture_ms: saveMs / 11, authenticated_reload_restore_ms: restoreMs, first_batch_intents: 10, first_batch_sync_and_readback_ms: batchMs })), contentType: "application/json" });
 await f.account.cleanup();
});
test("signout retains encrypted intent but another account cannot reveal it", async ({ page }) => {
 test.setTimeout(120000); const f = await setup(page), form = await edit(page, "7");
 await offline(page); await form.getByRole("button", { name: "Kaydet" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 await online(page); await page.goto("/workspace"); await expectReady(page);
 await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toBeVisible();
 const secondTab = await page.context().newPage(); await secondTab.goto("/workspace"); await expectReady(secondTab);
 await secondTab.getByRole("button", { name: "Oturumu kapat" }).click(); await expect(secondTab).toHaveURL(/sign-in/);
 await expect(page.getByText("Özel bilgiler gizlendi", { exact: false })).toBeVisible(); await secondTab.close();
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

async function operation(page: Page, headers: Record<string, string>, route: string, command: object, expected = 200) {
 const response = await page.request.post(route, { headers, data: { mutation_id: randomUUID(), ...command } });
 expect(response.status(), await response.text()).toBe(expected); return response.json();
}
test("switching organization conceals the original encrypted scope and restores it only on return", async ({ page }) => {
 test.setTimeout(120000); const f = await setup(page), form = await edit(page, "7");
 await offline(page); await form.getByRole("button", { name: "Kaydet" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible(); await online(page);
 const organization = randomUUID(), location = randomUUID(), member = randomUUID();
 sql(`insert into public.organizations(id,name,slug,base_currency) values ('${organization}','Synthetic Other Salon','offline-${organization}','TRY');
 insert into public.locations(id,organization_id,name,timezone) values ('${location}','${organization}','Other Branch','Europe/Istanbul');
 insert into public.salon_memberships(id,organization_id,user_id,location_id,role_code,status,joined_at) values ('${member}','${organization}','${f.account.userId}',null,'owner','active',now());`);
 await page.goto("/workspace"); await expectReady(page); await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toBeVisible();
 const chooser = await page.context().newPage(); await chooser.goto("/workspaces?choose=1");
 await chooser.getByRole("button", { name: /Synthetic Other Salon.*Other Branch/ }).click();
 // The redesigned workspace separates salon identity from branch/role context.
 // Verify both visible fields and the authoritative scope, not their punctuation.
 await expect(chooser.locator(".today-context").getByText("Synthetic Other Salon", { exact: true })).toBeVisible();
 await expect(chooser.locator(".today-context").getByText("Other Branch · Salon Sahibi", { exact: true })).toBeVisible();
 const selectedScope = await chooser.evaluate(async () => {
  const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
  return { status: response.status, body: await response.json() };
 });
 expect(selectedScope.status).toBe(200);
 expect(selectedScope.body.context.organization_id).toBe(organization);
 expect(selectedScope.body.context.location_id).toBe(location);
 expect(selectedScope.body.context.membership_id).toBe(member);
 await expect(chooser.getByRole("region", { name: "Yerel taslaklar" })).toHaveCount(0);
 await expect(page.getByText("Özel bilgiler gizlendi", { exact: false })).toBeVisible();
 await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toHaveCount(0); expect((await storageShape(page)).count).toBe(1);
 await chooser.close(); await page.goto("/workspaces?choose=1");
 await page.getByRole("button", { name: /Studio E2E.*Bolu/ }).click(); await expectReady(page);
 await expect(page.getByRole("region", { name: "Yerel taslaklar" })).toBeVisible(); await f.account.cleanup();
});
test("captured appointment intent rejects a slot booked while disconnected", async ({ page }, info) => {
 test.setTimeout(180000); const f = await setup(page), service = randomUUID();
 const write = (q: object) => operation(page, f.headers, "/api/salon", q);
 await write({ type: "HOURS_SAVE", expected_version: 0, days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, closed: false, opens: 540, closes: 1080 })) });
 await write({ type: "STAFF_SAVE", membership_id: f.account.membershipId, expected_version: 0, definition: { display_name: "Synthetic offline staff", active: true, bookable: true, working_capacity: null, notes: null, competencies: [], shifts: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, type: "SHIFT", starts: 540, ends: 1080 })) } });
 await write({ type: "SERVICE_SAVE", id: service, expected_version: 0, definition: { name: "Synthetic offline care", category: "CARE", description: null, organization_wide: false, base_duration_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0, base_price: 100, tax_rate: 0, tax_inclusive: true, requires_colorlab: false, requires_hair_passport: false, requires_precheck: false, active: true, eligible_membership_ids: [f.account.membershipId], capabilities: [], resources: [] } });
 const date = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), start = `${date}T10:00`;
 await page.goto("/workspace/appointments"); await page.getByRole("button", { name: "Randevu oluştur", exact: true }).click();
 const dialog = page.getByRole("dialog"); await dialog.getByLabel("Müşteri ara", { exact: true }).fill("Synthetic Offline");
 await dialog.getByRole("button", { name: "Synthetic Offline Client", exact: true }).click();
 await dialog.getByLabel("Hizmet", { exact: true }).selectOption(service); await dialog.getByLabel("Personel", { exact: true }).selectOption(f.account.membershipId);
 await dialog.getByLabel("Başlangıç (Europe/Istanbul)").fill(start); await dialog.getByLabel("Durum", { exact: true }).selectOption("CONFIRMED");
 await dialog.getByRole("button", { name: "Yerel taslak olarak koru" }).click(); await expect(dialog.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 await dialog.getByRole("button", { name: "Kapat", exact: true }).click(); await offline(page);
 await write({ type: "APPOINTMENT_SAVE", id: randomUUID(), expected_version: 0, definition: { client_id: f.id, service_id: service, staff_membership_id: f.account.membershipId, local_start: start, utc_offset_minutes: null, scheduled_duration_minutes: null, adjustment_reason: null, notes: null, status: "CONFIRMED" } });
 await online(page); await page.reload(); const result = page.waitForResponse(r => new URL(r.url()).pathname === "/api/salon" && r.request().method() === "POST");
 await page.getByRole("button", { name: "Taslakları senkronize et" }).click(); const response = await result;
 expect(response.status()).toBe(409); expect((await response.json()).code).toBe("STAFF_DOUBLE_BOOKED");
 await expect(page.getByText("Randevu · Randevu uygunluğu değişti")).toBeVisible();
 const snapshot = await (await page.request.get(`/api/salon?from=${date}&to=${date}`)).json(); expect(snapshot.data.appointments).toHaveLength(1);
 await page.screenshot({ path: info.outputPath("phase-8-appointment-conflict.png"), fullPage: true }); await f.account.cleanup();
});

test("stock and cash preparations stay review-only after movements and subscription changes", async ({ page }, info) => {
 test.setTimeout(180000); const f = await setup(page), item = randomUUID();
 const stock = (q: object, status = 200) => operation(page, f.headers, "/api/stock", q, status);
 const finance = (q: object, status = 200) => operation(page, f.headers, "/api/finance", q, status);
 await stock({ type: "ENABLE", reason: "Synthetic measured cutover" });
 await stock({ type: "ITEM_SAVE", id: item, expected_version: 0, reason: "Synthetic operational product", definition: { source: "SALON_CUSTOM_OPERATIONAL_PRODUCT", catalog_product_id: null, product_type: "SHAMPOO", display_name: "Synthetic offline inventory", sku: "OFFLINE-8", barcode: null, inventory_unit: "GRAM", active: true, track_quantity: true, lot_required: false, low_threshold: 0 } });
 const movement = (type: string, quantity: number) => ({ type, stock_item_id: item, lot_id: null, quantity, unit: "GRAM", occurred_at: new Date().toISOString(), reference: null, reason: "Synthetic measured fact" });
 await stock(movement("OPENING", 100)); await page.goto("/workspace/stock"); await page.getByRole("button", { name: "Fiziksel sayım", exact: true }).click();
 await page.getByLabel("Ölçülen miktar").fill("95"); await page.getByLabel("Gerekçe", { exact: true }).fill("Synthetic offline count preparation");
 await offline(page); await page.getByRole("button", { name: "Yerel taslak olarak koru" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible();
 await online(page); const count = randomUUID(); await stock({ type: "COUNT_CREATE", id: count, lines: [{ stock_item_id: item, lot_id: null, counted_quantity: 95 }], reason: "Freshly reviewed count" });
 await stock(movement("RECEIPT", 10)); expect((await stock({ type: "COUNT_CONFIRM", id: count, reason: "Reject stale count" }, 409)).code).toBe("STOCK_COUNT_STALE");
 await page.getByRole("button", { name: "Taslakları senkronize et" }).click(); await expect(page.getByText("Stok sayımı · Sunucunun güncel kontrolleri uygulanacak")).toBeVisible();
 expect((await (await page.request.get(`/api/stock?item_id=${item}`)).json()).data.items[0].on_hand).toBe(110);
 await finance({ type: "CURRENCY_SET", currency: "TRY", expected_version: 0, reason: "Synthetic finance initialization" }); const cash = randomUUID();
 await finance({ type: "CASH_OPEN", id: cash, currency: "TRY", opening_cash_minor: "10000", reason: "Synthetic measured opening" });
 await page.goto("/workspace/finance"); await page.getByRole("button", { name: "Kasa sayımını gönder" }).click();
 await page.getByLabel("Sayılan nakit").fill("100"); await page.getByLabel("Gerekçe", { exact: true }).fill("Synthetic offline cash preparation");
 await offline(page); await page.getByRole("button", { name: "Yerel taslak olarak koru" }).click(); await expect(page.getByText(/Taslak cihazda şifreli korundu/)).toBeVisible(); await online(page);
 await finance({ type: "CASH_CLOSE_SUBMIT", id: cash, expected_version: 1, counted_cash_minor: "10000", reason: "Fresh online review" });
 await finance({ type: "PAYMENT", id: randomUUID(), client_id: f.id, currency: "TRY", amount_minor: "100", method: "CASH", appointment_id: null, external_reference: null, occurred_at: new Date().toISOString(), reason: "Intervening cash payment", allocations: [], confirm_credit: true });
 expect((await finance({ type: "CASH_CLOSE_CONFIRM", id: cash, expected_version: 2, acknowledge_difference: true, reason: "Reject stale cash close" }, 409)).code).toBe("CASH_CLOSE_STALE");
 configure(f.context.organization_id, "SUSPENDED");
 expect((await stock(movement("RECEIPT", 1), 409)).code).toBe("SUBSCRIPTION_RESTRICTED");
 await page.reload(); await page.getByRole("button", { name: "Taslakları senkronize et" }).click();
 await expect(page.getByText("Kasa kapanışı · Sunucunun güncel kontrolleri uygulanacak")).toBeVisible();
 const state = (await (await page.request.get("/api/finance")).json()).data;
 expect(state.cash_sessions.find((s: { id: string }) => s.id === cash).status).toBe("CLOSING_REVIEW"); expect(state.documents.filter((d: { type: string }) => d.type === "PAYMENT")).toHaveLength(1);
 await page.setViewportSize({ width: info.project.name === "chromium" ? 1440 : 320, height: 900 });
 await page.screenshot({ path: info.outputPath("phase-8-stock-cash-review.png"), fullPage: true }); configure(f.context.organization_id, "ACTIVE"); await f.account.cleanup();
});

test("legacy Live intents are atomically sealed and another account cannot unwrap them", async ({ page }) => {
 test.setTimeout(120000); const f = await setup(page), mutation = randomUUID(), scope = `${f.context.membership_id}:${f.context.location_id}:${randomUUID()}:${randomUUID()}`;
 await page.evaluate(async ({ mutation, scope }) => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("elifora-live-drafts", 1); r.onupgradeneeded = () => r.result.createObjectStore("drafts", { keyPath: "key" }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  await new Promise<void>((resolve, reject) => { const t = db.transaction("drafts", "readwrite"); t.objectStore("drafts").put({ key: mutation, scope, createdAt: new Date().toISOString(), command: { type: "NOTE", mutation_id: mutation, text: "Synthetic private legacy intent", expected_version: 1, control_epoch: 1, device_id: scope.split(":")[2] } }); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); }); db.close();
 }, { mutation, scope });
 await page.reload(); await expect.poll(() => page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("elifora-live-drafts"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  if (!db.objectStoreNames.contains("sealed")) { db.close(); return null; }
  const counts = await Promise.all(["drafts", "sealed"].map(name => new Promise<number>((resolve, reject) => { const r = db.transaction(name).objectStore(name).count(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }))); db.close(); return counts;
 })).toEqual([0, 1]);
 const wrapped = await page.evaluate(async () => {
  const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("elifora-live-drafts", 2); r.onsuccess = () => resolve(r.result); });
  const row = await new Promise<Record<string, string>>(resolve => { const r = db.transaction("sealed").objectStore("sealed").getAll(); r.onsuccess = () => resolve(r.result[0]); }); db.close();
  if ("command" in row) throw new Error("Legacy plaintext retained");
  return { scope: row.scope, ephemeral_public_key: row.ephemeral_public_key, iv: row.wrap_iv, wrapped_key: row.wrapped_key };
 });
 // Keep returned decryption material inside the browser; report only a boolean.
 expect(await page.evaluate(async expected => {
  const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open("elifora-live-drafts", 2); r.onsuccess = () => resolve(r.result); });
  const row = await new Promise<{ scope: string; key: string; ephemeral_public_key: string; wrap_iv: string; wrapped_key: string; data_iv: Uint8Array; data: ArrayBuffer }>(resolve => { const r = db.transaction("sealed").objectStore("sealed").getAll(); r.onsuccess = () => resolve(r.result[0]); }); db.close();
  const response = await fetch("/api/offline-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: row.scope, ephemeral_public_key: row.ephemeral_public_key, iv: row.wrap_iv, wrapped_key: row.wrapped_key }) });
  if (!response.ok) return false; const body = await response.json();
  const bytes = Uint8Array.from(body.key.match(/.{2}/g) as string[], (v: string) => parseInt(v, 16));
  const key = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["decrypt"]);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(row.data_iv), additionalData: new TextEncoder().encode(row.key) }, key, row.data);
  return JSON.parse(new TextDecoder().decode(data)).command.mutation_id === expected;
 }, mutation)).toBe(true);
 await page.goto("/workspace"); await expectReady(page); await page.getByRole("button", { name: "Oturumu kapat" }).click(); await expect(page).toHaveURL(/sign-in/);
 const other = await seedAccount(); await login(page, other); await expectReady(page);
 expect((await page.request.post("/api/offline-context", { headers: { origin: "http://127.0.0.1:4173" }, data: wrapped })).status()).toBe(403);
 await f.account.cleanup(); await other.cleanup();
});
