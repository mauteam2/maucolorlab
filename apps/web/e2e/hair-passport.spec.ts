import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedAccount, login, expectReady } from "./local-auth";
async function setup(page: Page) {
 const account = await seedAccount(); await login(page, account); await expectReady(page);
 const session = await (await page.request.get("/api/session")).json();
 const headers = { origin: "http://127.0.0.1:4173", "x-workspace-reference": `${session.context.membership_id}:${session.context.location_id}` };
 const created = await page.request.post("/api/clients", { headers, data: { operation: "create", payload: { full_name: "Sentetik Saç Profili", phone: "05321234567", request_id: randomUUID() } } });
 expect(created.ok()).toBeTruthy(); const client = (await created.json()).data;
 async function append(path: string, payload: object) {
  const response = await page.request.post(`/api/clients/${client.id}/hair-passport${path}`, { headers, data: { request_id: randomUUID(), ...payload } });
  expect(response.ok(), await response.text()).toBeTruthy(); return (await response.json()).data;
 }
 return { account, client, append, url: `/workspace/clients/${client.id}` };
}
test("real passport navigation, regions, tests, history pagination and revoked access", async ({ page }, info) => {
 test.setTimeout(120000);
 await page.setViewportSize(info.project.name === "chromium" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
 const { account, client, append, url } = await setup(page);
 await append("", { technical: { natural_level: { state: "KNOWN", value: 5 } } });
 await append("/regions", { region_type: "CUSTOM", label: "Ön bölümde önceki açma işlemi yapılan uzun alan" });
 await append("/observations", { expected_version: 1, replace_unverified: true, technical: { natural_level: { state: "KNOWN", value: 5 }, perceived_level: { state: "KNOWN", value: 7 }, grey_ratio: { state: "KNOWN", value: .25 }, porosity: { state: "UNKNOWN", value: null }, tone: { state: "NOT_APPLICABLE", value: null } }, evidence: { source: "PROFESSIONAL_VERIFIED", attestation: "PERSONALLY_ASSESSED", confidence: { state: "KNOWN", value: .8 } } });
 await append("/tests", { type: "STRAND", result: { state: "KNOWN", value: "Sentetik tutam gözlemi" }, notes: "Yalnızca test ortamı için kayıt." });
 for (let i = 0; i < 11; i++) await append("/history", { category: "BLEACH_LIGHTENING", performed_on: i === 0 ? { state: "UNKNOWN", value: null } : { state: "APPROXIMATE", value: "2025-06-01" }, product: { state: "UNKNOWN", value: null }, description: `Sentetik geçmiş kaydı ${i}`, evidence: { source: "IMPORTED_UNVERIFIED" } });
 await page.goto(url); await page.getByRole("link", { name: "Saç Pasaportu", exact: true }).click();
 await expect(page.getByRole("heading", { name: client.full_name })).toBeVisible();
 for (const name of ["Dip", "Boylar", "Uçlar"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
 await expect(page.getByRole("heading", { name: /Özel bölge/ })).toBeVisible();
 await expect(page.getByText("Sentetik tutam gözlemi")).toBeVisible();
 await expect(page.getByText(/Yaklaşık ·/).first()).toBeVisible();
 await expect(page.getByText("Tarih bilinmiyor")).toBeVisible();
 await expect(page.getByText("Profesyonel Doğrulaması", { exact: true }).first()).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath("client-hair-passport.png"), fullPage: true });
 await page.getByRole("navigation", { name: "Teknik geçmiş", exact: true }).getByRole("button", { name: "Sonraki" }).click();
 await expect(page.getByRole("navigation", { name: "Teknik geçmiş", exact: true })).toContainText("Sayfa 2");
 await account.revoke(); await page.evaluate(() => window.dispatchEvent(new Event("focus")));
 await expect(page.getByRole("heading", { name: client.full_name })).toHaveCount(0);
 await expect(page).toHaveURL(/\/workspaces/, { timeout: 25000 });
});
test("empty passport and archived client remain read only", async ({ page }, info) => {
 test.setTimeout(90000);
 await page.setViewportSize(info.project.name === "chromium" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
 const { client, url } = await setup(page); await page.goto(url + "/hair-passport");
 await expect(page.getByRole("heading", { name: "Saç Pasaportu henüz oluşturulmadı" })).toBeVisible();
 await page.screenshot({ path: info.outputPath("client-hair-empty.png"), fullPage: true });
 await page.goto(url); await page.getByRole("button", { name: "Arşivle", exact: true }).click(); await page.getByRole("button", { name: "Evet, arşivle" }).click();
 await expect(page.getByText("Arşivde", { exact: true })).toBeVisible(); await page.getByRole("link", { name: "Saç Pasaportu", exact: true }).click();
 await expect(page.getByText("Arşivlenen müşteri · Geçmiş kayıtlar görüntüleniyor")).toBeVisible();
 await expect(page.getByRole("heading", { name: client.full_name })).toBeVisible();
 await expect(page.getByRole("button", { name: /Oluştur|Düzenle|Kaydet/ })).toHaveCount(0);
});
