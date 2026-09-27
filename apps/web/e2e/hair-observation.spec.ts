import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";

async function setup(page: Page) {
 const account = await seedAccount(); await login(page, account); await expectReady(page);
 const session = await (await page.request.get("/api/session")).json();
 const response = await page.request.post("/api/clients", { headers: { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${session.context.membership_id}:${session.context.location_id}` }, data: { operation: "create", payload: { full_name: "Sentetik Gözlem Profili", phone: "05329998877", request_id: randomUUID() } } });
 expect(response.ok()).toBeTruthy();
 const client = (await response.json()).data;
 return { account, url: `/workspace/clients/${client.id}/hair-passport` };
}

test("record global and regional observations while retaining older history", async ({ page }, info) => {
 test.setTimeout(120000);
 await page.setViewportSize(info.project.name === "chromium" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
 const { account, url } = await setup(page);
 await page.goto(url);
 await page.getByRole("button", { name: "Hair Passport Oluştur" }).click();
 await page.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.getByRole("button", { name: "Yeni Gözlem Ekle" })).toBeVisible();
 await page.getByRole("button", { name: "Yeni Gözlem Ekle" }).click();
 const form = page.locator(".hp-observation-editor");
 await form.getByLabel("Gözlenen değer").fill("5");
 await page.screenshot({ path: info.outputPath("client-hair-observation-known.png"), fullPage: true });
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(form.getByRole("alert")).toContainText("profesyonel gözleminizi doğrulayın");
 await page.screenshot({ path: info.outputPath("client-hair-observation-validation.png"), fullPage: true });
 await form.getByLabel("Bu değerlendirmeyi profesyonel gözlemim olarak doğruluyorum.").check();
 await form.getByLabel("Gözleme duyulan güven (%)").fill("80");
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.getByText("Gözlem kaydedildi; güncel Saç Pasaportu yüklendi.")).toBeVisible();
 await expect(page.locator("#hp-observations .hp-records > li")).toHaveCount(1);
 await page.screenshot({ path: info.outputPath("client-hair-observation-saved.png"), fullPage: true });
 await page.getByRole("button", { name: "Yeni Gözlem Ekle" }).click();
 await form.getByLabel("Teknik alan").selectOption("porosity");
 await form.getByLabel("Gözlem bölgesi").selectOption({ label: "Dip" });
 await form.getByLabel("Bilgi durumu").selectOption("UNKNOWN");
 await expect(form.getByLabel("Gözlenen değer")).toHaveCount(0);
 await page.screenshot({ path: info.outputPath("client-hair-observation-unknown.png"), fullPage: true });
 await form.getByLabel("Bu değerlendirmeyi profesyonel gözlemim olarak doğruluyorum.").check();
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.locator("#hp-observations .hp-records > li")).toHaveCount(2);
 await page.getByRole("button", { name: "Yeni Gözlem Ekle" }).click();
 await form.getByLabel("Bilgi durumu").selectOption("NOT_ASSESSED");
 await form.getByLabel("Bu değerlendirmeyi profesyonel gözlemim olarak doğruluyorum.").check();
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.locator("#hp-observations .hp-records > li")).toHaveCount(3);
 await page.reload();
 await expect(page.locator("#hp-observations .hp-records > li")).toHaveCount(3);
 await expect(page.locator("#hp-observations")).toContainText("%80");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 const assistant = await account.addMember("assistant");
 await page.context().clearCookies(); await login(page, assistant); await expectReady(page);
 await page.goto(url);
 await expect(page.locator("#hp-observations .hp-records > li")).toHaveCount(3);
 await expect(page.getByRole("button", { name: "Yeni Gözlem Ekle" })).toHaveCount(0);
});

test("revoked membership cannot save an open observation", async ({ page }, info) => {
 test.setTimeout(90000);
 await page.setViewportSize(info.project.name === "chromium" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
 const { account, url } = await setup(page);
 await page.goto(url); await page.getByRole("button", { name: "Hair Passport Oluştur" }).click(); await page.getByRole("button", { name: "Kaydet" }).click();
 await page.getByRole("button", { name: "Yeni Gözlem Ekle" }).click();
 await page.getByLabel("Gözlenen değer").fill("5");
 await page.getByLabel("Bu değerlendirmeyi profesyonel gözlemim olarak doğruluyorum.").check();
 await account.revoke(); await page.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.getByRole("heading", { name: "Sentetik Gözlem Profili" })).toHaveCount(0);
 await expect(page).toHaveURL(/\/workspaces/, { timeout: 25000 });
});
