import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";

async function setup(page: Page) {
 const account = await seedAccount(); await login(page, account); await expectReady(page);
 const session = await (await page.request.get("/api/session")).json();
 const response = await page.request.post("/api/clients", { headers: { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${session.context.membership_id}:${session.context.location_id}` }, data: { operation: "create", payload: { full_name: "Sentetik Fiziksel Test Profili", phone: "05328887766", request_id: randomUUID() } } });
 expect(response.ok()).toBeTruthy();
 const client = (await response.json()).data;
 return { account, url: `/workspace/clients/${client.id}/hair-passport` };
}

test("records three test types, retains older tests, and enforces read-only access", async ({ page }, info) => {
 test.setTimeout(120000);
 await page.setViewportSize(info.project.name === "chromium" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
 const { account, url } = await setup(page);
 await page.goto(url);
 await page.getByRole("button", { name: "Hair Passport Oluştur" }).click();
 await page.getByRole("button", { name: "Kaydet" }).click();
 const add = page.getByRole("button", { name: "Yeni Fiziksel Test Kaydet" });
 const form = page.locator(".hp-physical-test-editor");
 await expect(add).toBeVisible(); await add.click();
 await expect(form.getByRole("heading", { name: "Yeni fiziksel test" })).toBeFocused();
 await page.screenshot({ path: info.outputPath("client-hair-test-porosity.png"), fullPage: true });
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(form.getByRole("alert")).toContainText("Geçerli bir test sonucu");
 await page.screenshot({ path: info.outputPath("client-hair-test-validation.png"), fullPage: true });
 await form.getByLabel("Porozite sonucu").selectOption("HIGH");
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.locator("#hp-tests .hp-records > li")).toHaveCount(1);
 await page.screenshot({ path: info.outputPath("client-hair-test-saved.png"), fullPage: true });
 await add.click();
 await form.getByLabel("Test türü").selectOption("ELASTICITY");
 await form.getByLabel("Test bölgesi").selectOption({ label: "Dip" });
 await form.getByLabel("Elastikiyet sonucu").selectOption("NORMAL");
 await page.screenshot({ path: info.outputPath("client-hair-test-elasticity-region.png"), fullPage: true });
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.locator("#hp-tests .hp-records > li")).toHaveCount(2);
 await add.click();
 await form.getByLabel("Test türü").selectOption("STRAND");
 await form.getByLabel("Tutam testi bulgusu").fill("Tutam bütünlüğü korundu");
 await form.getByLabel("Teknik not (isteğe bağlı)").fill("Gözlemlenen tutam");
 await page.screenshot({ path: info.outputPath("client-hair-test-strand.png"), fullPage: true });
 await form.getByRole("button", { name: "Kaydet" }).click();
 await expect(page.locator("#hp-tests .hp-records > li")).toHaveCount(3);
 await page.reload();
 await expect(page.locator("#hp-tests .hp-records > li")).toHaveCount(3);
 for (const name of ["Porozite Testi", "Elastikiyet Testi", "Tutam Testi"]) await expect(page.locator("#hp-tests").getByRole("heading", { name })).toBeVisible();
 await expect(page.locator("#hp-tests")).toContainText("Dip");
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 const assistant = await account.addMember("assistant");
 await page.context().clearCookies(); await login(page, assistant); await expectReady(page);
 await page.goto(url);
 await expect(page.locator("#hp-tests .hp-records > li")).toHaveCount(3);
 await expect(add).toHaveCount(0);
});

test("revoked membership cannot save an open physical test", async ({ page }, info) => {
 test.setTimeout(90000);
 await page.setViewportSize(info.project.name === "chromium" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
 const { account, url } = await setup(page);
 await page.goto(url);
 await page.getByRole("button", { name: "Hair Passport Oluştur" }).click();
 await page.getByRole("button", { name: "Kaydet" }).click();
 await page.getByRole("button", { name: "Yeni Fiziksel Test Kaydet" }).click();
 await page.getByLabel("Porozite sonucu").selectOption("LOW");
 await account.revoke();
 await page.locator(".hp-physical-test-editor").getByRole("button", { name: "Kaydet" }).click();
 await expect(page.getByRole("heading", { name: "Sentetik Fiziksel Test Profili" })).toHaveCount(0);
 await expect(page).toHaveURL(/\/workspaces/, { timeout: 25000 });
});
