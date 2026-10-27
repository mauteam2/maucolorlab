import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { colorPilotFixture, generatePilotPlan } from "./color-pilot-flow";

/** Actual authenticated workspace routes; no API interception or cosmetic data injection. */
async function capture(page: Page, info: TestInfo, screen: string) {
 for (const width of [1440, 1280, 1024, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(async () => {
   if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
   window.scrollTo(0, 0); await document.fonts.ready;
   await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${screen}: ${width}px overflow`).toBe(true);
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.locator('.salon-sidebar [aria-current="page"]')).toHaveCount(1);
  if (screen === "profile") {
   const workspaces = page.getByRole("navigation", { name: "Müşteri çalışma alanları" });
   await expect(workspaces.getByRole("link", { name: "Renk planı ve reçete →" })).toBeVisible();
   await expect(workspaces.getByRole("link", { name: "Canlı seans geçmişi →" })).toBeVisible();
  }
  if ([1440, 390, 320].includes(width)) await page.screenshot({ path: info.outputPath(`ui-ux-${screen}-${width}.png`), fullPage: true });
 }
}

test("professional workspaces preserve usable layout at six viewport widths", async ({ page }, info) => {
 test.setTimeout(240000);
 const { account, client, headers } = await colorPilotFixture(page);
 try {
  await capture(page, info, "colorlab-target");
  await page.getByRole("region", { name: "Hızlı hedef oluşturucu" }).getByRole("button", { name: "Karamel", exact: true }).click();
  const plan = await generatePilotPlan(page);
  expect(plan.result.engineVersion).toBe("color-engine/1.1.0");
  await expect(page.getByRole("heading", { name: "Neden bu yol?" })).toBeVisible();
  await capture(page, info, "colorlab-result");
  const write = async (path: string, command: object) => {
   const response = await page.request.post(path, { headers, data: { mutation_id: randomUUID(), ...command } });
   expect(response.status(), `Synthetic ${path} fixture`).toBe(200);
  };
  await write("/api/stock", { type: "ENABLE", reason: "Disposable design verification physical opening" });
  const item = randomUUID();
  await write("/api/stock", { type: "ITEM_SAVE", id: item, expected_version: 0, reason: "Disposable operational product", definition: { source: "SALON_CUSTOM_OPERATIONAL_PRODUCT", catalog_product_id: null, product_type: "SHAMPOO", display_name: "Sentetik bakım ürünü", sku: "UX-SYNTHETIC", barcode: null, inventory_unit: "GRAM", active: true, track_quantity: true, lot_required: false, low_threshold: 20 } });
  await write("/api/stock", { type: "OPENING", stock_item_id: item, lot_id: null, quantity: 12, unit: "GRAM", occurred_at: new Date().toISOString(), reference: null, reason: "Synthetic measured quantity" });
  await write("/api/finance", { type: "CURRENCY_SET", currency: "TRY", expected_version: 0, reason: "Disposable design verification currency" });
  await write("/api/finance", { type: "MANUAL_CHARGE", id: randomUUID(), client_id: client.id, currency: "TRY", amount_minor: "125000", tax_rate_bps: 2000, tax_inclusive: true, description: "Sentetik renk danışmanlığı", occurred_at: new Date().toISOString(), reason: "Disposable completed service" });
  await write("/api/finance", { type: "DEPOSIT", id: randomUUID(), client_id: client.id, currency: "TRY", amount_minor: "25000", method: "CARD", appointment_id: null, external_reference: null, occurred_at: new Date().toISOString(), reason: "Disposable deposit liability" });
  for (const [screen, path, ready] of [
   ["dashboard", "/workspace", ".today-heading"],
   ["clients", "/workspace/clients", ".crm-client-card"],
   ["profile", `/workspace/clients/${client.id}`, ".salon-profile-banner"],
   ["hair-passport", `/workspace/clients/${client.id}/hair-passport`, ".hp-region-map"],
   ["catalog", "/workspace/catalog", ".registry-record"],
   ["appointments", "/workspace/appointments", ".salon-operations-columns"],
   ["stock", "/workspace/stock", ".stock-table"],
   ["finance", "/workspace/finance", ".salon-stats"],
   ["reports", "/workspace/reports", ".report-metrics"],
  ]) {
   await page.goto(path!);
   await expect(page.locator(ready!).first()).toBeVisible();
   if (screen === "dashboard") {
    await expect(page.getByRole("region", { name: "Bugünün ajandası" })).toBeVisible();
    await page.locator(".today-business > summary").click();
    await expect(page.locator(".today-business .today-revenue")).toBeVisible();
   }
   await capture(page, info, screen!);
  }
  await page.getByRole("button", { name: "Menü", exact: true }).click();
  await expect(page.getByRole("link", { name: "Marka kütüphanesi bölümü" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Menü", exact: true })).toBeFocused();
 } finally { await account.cleanup(); }
});

test("sign-in keeps the approved mark and reduced-motion end state", async ({ page }, info) => {
 await page.emulateMedia({ reducedMotion: "reduce" });
 await page.goto("/sign-in");
 for (const width of [1440, 1280, 1024, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 1000 });
  await expect(page.getByRole("button", { name: "Oturum aç", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if ([1440, 390, 320].includes(width)) await page.screenshot({ path: info.outputPath(`ui-ux-sign-in-${width}.png`), fullPage: true });
 }
});
