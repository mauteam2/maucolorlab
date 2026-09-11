import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { login, seedAccount, expectReady } from "./local-auth";

// Client/audit records intentionally survive individual tests: this database is disposable,
// and the production hard-delete prohibition must not be weakened for fixture cleanup.
async function start(page: Page) {
  const account = await seedAccount(); await login(page, account); await expectReady(page);
  await page.getByRole("link", { name: "Müşteriler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Müşteriler", exact: true })).toBeVisible();
  return account;
}
async function fill(page: Page, name: string, phone: string) {
  await page.getByLabel("Ad Soyad *").fill(name); await page.getByLabel("Telefon *").fill(phone);
}
async function create(page: Page, name: string, phone: string) {
  await page.goto("/workspace/clients/new"); await fill(page, name, phone);
  await page.getByRole("button", { name: "Müşteri Oluştur", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  return page.url().split("/").at(-1)!;
}
async function command(page: Page, operation: string, payload: object) {
  const session = await (await page.request.get("/api/session")).json();
  const reference = session.context ? `${session.context.membership_id}:${session.context.location_id}` : "invalid";
  const response = await page.request.post("/api/clients", { headers: { origin: "http://127.0.0.1:4173", "x-workspace-reference": reference }, data: { operation, payload } });
  return { status: response.status(), body: await response.json() };
}
test("directory, validation, normal create, name/phone search, edit, archive and restore", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await start(page);
  await expect(page.getByRole("heading", { name: "Henüz müşteri yok" })).toBeVisible();
  await page.getByRole("link", { name: "Yeni müşteri", exact: true }).click();
  await page.getByRole("button", { name: "Müşteri Oluştur" }).click();
  expect(await page.getByLabel("Ad Soyad *").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await fill(page, "Ayşe Yılmaz", "0532 123 45 67");
  await page.getByLabel("E-posta", { exact: true }).fill("ayse@example.test");
  await page.getByLabel("Doğum Tarihi").fill("1990-04-23");
  await page.screenshot({ path: testInfo.outputPath("client-form.png"), fullPage: true });
  await page.getByRole("button", { name: "Müşteri Oluştur" }).click();
  await expect(page.getByRole("heading", { name: "Ayşe Yılmaz", exact: true })).toBeVisible();
  await expect(page.getByText("+905321234567", { exact: true })).toBeVisible();
  const clientUrl = page.url();
  await page.screenshot({ path: testInfo.outputPath("client-detail.png"), fullPage: true });
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByLabel("Ad Soyad *").fill("Ayşe Demir");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Ayşe Demir", exact: true })).toBeVisible();
  for (const search of ["demir", "0532123"]) {
    await page.goto("/workspace/clients"); await page.getByLabel("Ad soyad veya telefon").fill(search);
    await page.getByRole("button", { name: "Ara", exact: true }).click();
    await expect(page.getByRole("link", { name: /Ayşe Demir/ })).toBeVisible();
    await expect(page.getByText("ayse@example.test")).toHaveCount(0);
  }
  await page.goto(clientUrl); await page.getByRole("button", { name: "Arşivle", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Müşteri arşivlensin mi?" })).toBeVisible();
  await page.getByRole("button", { name: "Evet, arşivle" }).click();
  await expect(page.getByText("Arşivde", { exact: true })).toBeVisible();
  await page.goto("/workspace/clients"); await expect(page.getByRole("link", { name: /Ayşe Demir/ })).toHaveCount(0);
  await page.getByLabel("Kayıt durumu").selectOption("ARCHIVED"); await page.getByRole("link", { name: /Ayşe Demir/ }).click();
  await page.getByRole("button", { name: "Arşivden çıkar" }).click(); await expect(page.getByText("Aktif müşteri", { exact: true })).toBeVisible();
});
test("phone duplicates open existing, explicitly allow separate people, and recheck on edit", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await start(page);
  const first = await create(page, "Deniz Kaya", "05321112233");
  await page.goto("/workspace/clients/new"); await fill(page, "Ece Kaya", "+90 (532) 111 22 33");
  await page.getByRole("button", { name: "Müşteri Oluştur" }).click();
  await expect(page.getByRole("heading", { name: "Benzer müşteri bulundu" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("client-duplicate.png"), fullPage: true });
  await page.getByRole("link", { name: /Mevcut müşteriyi aç/ }).click();
  await expect(page).toHaveURL(new RegExp(first + "$"));
  await page.goto("/workspace/clients/new"); await fill(page, "Ece Kaya", "05321112233");
  await page.getByRole("button", { name: "Müşteri Oluştur" }).click();
  await page.getByRole("button", { name: "Farklı kişi olduğunu onaylıyorum" }).click();
  await expect(page.getByRole("heading", { name: "Ece Kaya", exact: true })).toBeVisible();
  await create(page, "Selin Ak", "05324445566");
  await page.getByRole("button", { name: "Düzenle", exact: true }).click(); await page.getByLabel("Telefon *").fill("05321112233");
  await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
  await expect(page.getByRole("heading", { name: "Benzer müşteri bulundu" })).toBeVisible();
  await page.getByRole("button", { name: "Farklı kişi olduğunu onaylıyorum" }).click();
  await expect(page.getByRole("heading", { name: "Selin Ak", exact: true })).toBeVisible();
  await expect(page.getByText("+905321112233", { exact: true })).toBeVisible();
});
test("foreign URL and forged ownership are denied; revoked membership conceals the directory", async ({ page, browser }) => {
  test.setTimeout(90000);
  const account = await start(page); const foreignClient = await create(page, "Tenant A Person", "+442071234567");
  const other = await browser.newContext(); const second = await other.newPage();
  await start(second);
  await second.goto(`/workspace/clients/${foreignClient}`);
  await expect(second.getByRole("main").getByRole("alert")).toContainText("Müşteri bulunamadı");
  await expect(second.getByRole("heading", { name: "Tenant A Person" })).toHaveCount(0);
  expect((await command(second, "archive", { client_id: foreignClient, expected_version: 1, request_id: randomUUID() })).status).toBe(404);
  expect((await command(second, "create", { full_name: "Forged", phone: "05321112233", request_id: randomUUID(), organization_id: randomUUID() })).status).toBe(400);
  await other.close();
  await page.goto("/workspace/clients"); await expect(page.getByRole("link", { name: /Tenant A Person/ })).toBeVisible();
  await account.revoke();
  await expect(page).toHaveURL(/\/workspaces/, { timeout: 25000 });
  await expect(page.getByText("Tenant A Person")).toHaveCount(0);
  expect((await command(page, "list", {})).status).toBe(403);
});
test("changing selected location in another tab cannot redirect an open creation form", async ({ page }) => {
  const account = await seedAccount(2); await login(page, account);
  await page.getByRole("button", { name: /Studio E2E.*Bolu/ }).click(); await expectReady(page);
  await page.goto("/workspace/clients/new"); await fill(page, "Unsent Person", "05327778899");
  await page.context().addCookies([{ name: "elifora-workspace", value: `${account.membershipId}:${account.locations[1]!.id}`, url: "http://127.0.0.1:4173" }]);
  await page.getByRole("button", { name: "Müşteri Oluştur" }).click();
  await expect(page).toHaveURL(/\/workspaces/);
  await page.getByRole("button", { name: /Studio E2E.*Bolu/ }).click(); await expectReady(page);
  expect((await command(page, "list", {})).body.data.items).toHaveLength(0);
  await account.cleanup();
});
test("offline conceals client identity and retry restores a freshly authorized directory", async ({ page }) => {
  await start(page); await create(page, "Online Person", "05328889900"); await page.goto("/workspace/clients");
  await expect(page.getByRole("link", { name: /Online Person/ })).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByRole("link", { name: /Online Person/ })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Bağlantı kurulamadı");
  await page.context().setOffline(false);
  await expect(page.getByRole("link", { name: /Online Person/ })).toBeVisible({ timeout: 20000 });
});
test("concurrent creates and confirmations cannot skip duplicate review", async ({ page }) => {
  await start(page);
  const first = { full_name: "Concurrent One", phone: "05326667788", request_id: randomUUID() };
  const second = { full_name: "Concurrent Two", phone: "05326667788", request_id: randomUUID() };
  const initial = await Promise.all([command(page, "create", first), command(page, "create", second)]);
  expect(initial.map(result => result.status).sort()).toEqual([200, 409]);
  expect(initial.find(result => result.status === 409)?.body.code).toBe("DUPLICATE_CLIENT_CANDIDATES");
  const pending = ["Concurrent Three", "Concurrent Four"].map(full_name => ({ full_name, phone: "05326667788", request_id: randomUUID() }));
  const reviews = await Promise.all(pending.map(payload => command(page, "create", payload)));
  expect(reviews.every(result => result.body.code === "DUPLICATE_CLIENT_CANDIDATES")).toBe(true);
  const confirmations = await Promise.all(pending.map((payload, index) => command(page, "create", { ...payload, confirmation_token: reviews[index]!.body.confirmation_token })));
  expect(confirmations.map(result => result.status).sort()).toEqual([200, 409]);
  expect(confirmations.find(result => result.status === 409)?.body.code).toBe("DUPLICATE_CONFIRMATION_INVALID");
  expect((await command(page, "list", {})).body.data.items).toHaveLength(2);
});
test("periodic permission checks retain form focus and draft", async ({ page }) => {
  await start(page); await page.goto("/workspace/clients/new");
  const name = page.getByLabel("Ad Soyad *"); await name.fill("Draft Person");
  const refresh = page.waitForResponse(response => response.url().endsWith("/api/clients") && response.request().postDataJSON().operation === "list", { timeout: 20000 });
  await refresh;
  await expect(page.getByRole("button", { name: "Müşteri Oluştur" })).toBeEnabled();
  await expect(name).toBeFocused(); await expect(name).toHaveValue("Draft Person");
});
