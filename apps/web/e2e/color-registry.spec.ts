import { expect, test } from "./reliability-test";
import { seedAccount, login, expectReady } from "./local-auth";
const unavailable = "Bu seri ELIFORA kataloğunda bulunuyor ancak doğrulanmış teknik reçete desteği henüz yayınlanmadı.";

test("global discovery library has region-specific official receipts and no recipe authority", async ({ page }, info) => {
 const account = await seedAccount(1); await login(page, account); await expectReady(page);
 await page.goto("/workspace/catalog");
 await expect(page.getByRole("heading", { name: "Marka kütüphanesi", exact: true })).toBeVisible();
 await expect(page.getByRole("status")).toContainText("30 bölgesel kayıt");
 await page.getByLabel("Marka veya seri ara").fill("Color Touch");
 await page.getByLabel("Pazar", { exact: true }).selectOption("US");
 await page.getByRole("button", { name: "Filtrele", exact: true }).click();
 await expect(page.getByRole("status")).toContainText("1 bölgesel kayıt");
 await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
 await page.getByText(/1 resmî kaynak/).click();
 await expect(page.getByText(/SHA-256:/)).toBeVisible();
 const packet = await page.request.get("/api/color-registry?region=TR");
 expect(packet.status()).toBe(200); expect((await packet.json()).data.items).toEqual([]);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath("global-catalog-library.png"), fullPage: true });
 await page.setViewportSize({ width: 320, height: 900 });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath("global-catalog-library-320.png"), fullPage: true });
});

test("ColorLab listed line selection stays information-only without cross-brand fallback", async ({ page }) => {
 const account = await seedAccount(1); await login(page, account); await expectReady(page);
 await page.goto("/workspace/colorlab");
 await page.getByText("Listelenen serileri incele", { exact: true }).click();
 await page.getByLabel("Listelenen seri").selectOption({ label: "Keune · Tinta Color · GB" });
 await expect(page.getByText(unavailable, { exact: true })).toBeVisible();
 const catalog = await page.request.get("/api/color-registry?brand=keune&region=GB");
 const data = (await catalog.json()).data;
 expect(data.items.every((item: { recipeSupport: boolean; catalogId: unknown; ruleCount: number }) => !item.recipeSupport && item.catalogId === null && item.ruleCount === 0)).toBe(true);
 const unbounded = await page.request.get("/api/color-registry?limit=51"); expect(unbounded.status()).toBe(400);
 await account.revoke();
 const denied = await page.request.get("/api/color-registry"); expect([401, 403]).toContain(denied.status());
});
