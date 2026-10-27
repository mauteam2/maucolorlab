import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";
import { localDate } from "@/lib/salon/engine";

// Real disposable Auth + server commands. Never intercept data or seed hosted salons.
async function fixture(page: Page) {
  const account = await seedAccount();
  await login(page, account); await expectReady(page);
  const context = (await (await page.request.get("/api/session")).json()).context;
  const headers = { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${context.membership_id}:${context.location_id}` };
  async function command(path: string, data: object) {
    const r = await page.request.post(path, { headers, data });
    expect(r.status(), `${path} synthetic fixture: ${await r.text()}`).toBe(200);
    return (await r.json()).data;
  }
  const save = (data: object) => command("/api/salon", { mutation_id: randomUUID(), ...data });
  const create = async (name: string, phone: string) => command("/api/clients", { operation: "create", payload: { full_name: name, phone, request_id: randomUUID() } });
  await save({ type: "HOURS_SAVE", expected_version: 0, days: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, closed: false, opens: 0, closes: 1440 })) });
  await save({ type: "STAFF_SAVE", membership_id: account.membershipId, expected_version: 0, definition: { display_name: "Elif · sentetik uzman", active: true, bookable: true, working_capacity: null, notes: null, competencies: [{ code: "GENERAL_COLOR", level: "INDEPENDENT" }], shifts: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, type: "SHIFT", starts: 0, ends: 1440 })) } });
  const color = randomUUID(), cut = randomUUID();
  for (const [id, name, technical] of [[color, "Dip boya ve tonlama", true], [cut, "Kesim ve şekillendirme", false]] as const) {
    await save({ type: "SERVICE_SAVE", id, expected_version: 0, definition: { name, category: technical ? "COLOR" : "CUT", description: "Disposable visual acceptance", organization_wide: false, base_duration_minutes: 60, buffer_before_minutes: 0, buffer_after_minutes: 0, base_price: 1250, tax_rate: 20, tax_inclusive: true, requires_colorlab: technical, requires_hair_passport: technical, requires_precheck: technical, active: true, eligible_membership_ids: [account.membershipId], capabilities: [], resources: [] } });
  }
  const today = localDate(new Date(), "Europe/Istanbul"), appointments: { id: string; version: number }[] = [];
  const clients: { id: string }[] = [];
  for (const [i, name, time, service] of [[0, "Deniz A. · sentetik", "09:30", color], [1, "Selin K. · sentetik", "11:00", color], [2, "Ece Y. · sentetik", "13:30", cut], [3, "Merve T. · sentetik", "15:00", color], [4, "Cemre S. · sentetik", "16:30", cut]] as const) {
    const client = await create(name, `0532999400${i}`); clients.push(client);
    const a = await save({ type: "APPOINTMENT_SAVE", id: randomUUID(), expected_version: 0, definition: { client_id: client.id, service_id: service, staff_membership_id: account.membershipId, local_start: `${today}T${time}`, utc_offset_minutes: null, scheduled_duration_minutes: null, adjustment_reason: null, notes: null, status: "CONFIRMED" } });
    appointments.push(a);
  }
  // One completed visit, one genuinely active workflow, remaining slots stay booked.
  for (const status of ["ARRIVED", "IN_SERVICE", "COMPLETED"]) {
    const a = appointments[0]!;
    appointments[0] = await save({ type: "APPOINTMENT_TRANSITION", id: a.id, expected_version: a.version, status, reason: "Disposable visual acceptance lifecycle" });
  }
  for (const status of ["ARRIVED", "IN_SERVICE"]) {
    const a = appointments[1]!;
    appointments[1] = await save({ type: "APPOINTMENT_TRANSITION", id: a.id, expected_version: a.version, status, reason: "Disposable active workflow" });
  }
  // Reviewed duplicate warning is an existing deterministic CRM action source.
  const payload = { full_name: "Deniz alternatif · sentetik", phone: "05329994000", request_id: randomUUID() };
  const review = await page.request.post("/api/clients", { headers, data: { operation: "create", payload } });
  expect(review.status()).toBe(409);
  const pending = await review.json(); expect(pending.code).toBe("DUPLICATE_CLIENT_CANDIDATES");
  await command("/api/clients", { operation: "create", payload: { ...payload, confirmation_token: pending.confirmation_token } });
  await command("/api/crm", { type: "ACTION_CREATE", mutation_id: randomUUID(), id: randomUUID(), client_id: clients[0]!.id, kind: "DUPLICATE_REVIEW", source_domain: "client", source_id: clients[0]!.id });
  return { account, clients, appointments };
}
async function capture(page: Page, info: TestInfo, state: string) {
  for (const width of [1440, 1280, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await expect(page.getByRole("heading", { name: "Bugün", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state} ${width}px`).toBe(true);
    await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);
    if ([1440, 1024, 390, 320].includes(width)) await page.screenshot({ path: info.outputPath(`ui-ux-pass1-${state}-${width}.png`), fullPage: true });
  }
}
test("Today real operational day prioritizes current client, preparation, action and mobile keyboard", async ({ page, browser }, info) => {
  test.setTimeout(180000);
  const f = await fixture(page);
  try {
    await page.goto("/workspace");
    const current = page.getByRole("region", { name: "Şimdi ve sırada" });
    await expect(current.getByRole("heading", { name: "Selin K. · sentetik" })).toBeVisible();
    await expect(current.getByText("Şimdi · uygulamada")).toBeVisible();
    await expect(page.getByText("2/2 kontrol alındı")).toBeVisible();
    await expect(current.getByText("Hair Passport eksik")).toBeVisible();
    await expect(page.getByText("Benzer kayıt incelemesi", { exact: true })).toBeVisible();
    await expect(page.locator(".today-operational-agenda > li")).toHaveCount(5);
    await expect(page.locator(".today-operational-agenda > li time")).toHaveText(["09:3060 dk", "11:0060 dk", "13:3060 dk", "15:0060 dk", "16:3060 dk"]);
    await capture(page, info, "operational");
    await page.getByRole("button", { name: "Menü", exact: true }).click();
    await expect(page.getByRole("link", { name: "Bugün bölümü" })).toBeFocused();
    await expect(page.locator(".salon-mobile-context")).toContainText("Bolu");
    await expect(page.getByRole("link", { name: "ColorLab bölümü" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: info.outputPath("ui-ux-pass1-menu-390.png"), fullPage: true });
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.screenshot({ path: info.outputPath("ui-ux-pass1-menu-320.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Menü", exact: true })).toBeFocused();
    await current.getByRole("link", { name: "Profili aç", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workspace/clients/${f.clients[1]!.id}$`));
    const reception = await f.account.addMember("reception"), isolated = await browser.newContext(), receptionPage = await isolated.newPage();
    try {
      const forbiddenReads: string[] = [];
      receptionPage.on("request", r => { if (r.url().includes("/precheck") || r.url().includes("/api/reporting")) forbiddenReads.push(r.url()); });
      await login(receptionPage, reception); await expectReady(receptionPage);
      await expect(receptionPage.getByRole("heading", { name: "Selin K. · sentetik" })).toBeVisible();
      await expect(receptionPage.getByText("Teknik hazırlık", { exact: true })).toHaveCount(0);
      await expect(receptionPage.getByText("İşletme bağlamı", { exact: true })).toHaveCount(0);
      await expect(receptionPage.getByRole("link", { name: /ColorLab/ })).toHaveCount(0);
      expect(forbiddenReads).toEqual([]);
      await capture(receptionPage, info, "reception");
    } finally { await isolated.close(); }
  } finally { await f.account.cleanup(); }
});
test("Today empty real tenant remains compact with factual absence and accessible shell", async ({ page }, info) => {
  const account = await seedAccount();
  try {
    await login(page, account); await expectReady(page);
    await expect(page.getByText("Bugün henüz randevu yok.")).toBeVisible();
    await expect(page.getByText("Görünen listede açık takip aksiyonu yok.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Randevuyu aç" })).toHaveCount(0);
    await capture(page, info, "empty");
  } finally { await account.cleanup(); }
});
