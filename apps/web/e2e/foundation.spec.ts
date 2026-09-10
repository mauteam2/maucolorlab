import { expect, test } from "@playwright/test";

test("renders the responsive ELIFORA foundation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Renk çalışmalarınız");
  await expect(page.getByRole("link", { name: "Çalışma alanını aç" })).toBeVisible();
  await expect(page.getByText("Çalışma alanınıza salon üyeliğinizle erişin.")).toBeVisible();
});

test("protects the workspace with the server authentication boundary", async ({ page }) => {
  await page.goto("/workspace");

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Çalışma alanınıza hoş geldiniz");
});
