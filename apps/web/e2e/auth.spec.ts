import { expect, test } from "@playwright/test";
import { login, seedAccount, expectReady } from "./local-auth";

test("real login auto-selects, persists through browser restart, and logout clears access", async ({ page, browser }) => {
  const account = await seedAccount();
  try {
    await login(page, account);
    await expectReady(page);
    await expect.poll(async () => (await page.context().cookies()).some(c => c.name === "elifora-workspace")).toBe(true);
    // No storageState file containing session tokens is written to disk.
    const restored = await browser.newContext({ storageState: await page.context().storageState() });
    const restartedPage = await restored.newPage();
    await restartedPage.goto("http://127.0.0.1:4173/workspace");
    await expectReady(restartedPage);
    await restartedPage.getByRole("button", { name: "Oturumu kapat" }).click();
    await expect(restartedPage).toHaveURL(/\/sign-in$/);
    await restartedPage.goto("http://127.0.0.1:4173/workspace");
    await expect(restartedPage).toHaveURL(/\/sign-in/);
    expect((await restored.cookies()).filter(c => c.name.includes("-auth-token") || c.name === "elifora-workspace").length).toBe(0);
    await restored.close();
  } finally { await account.cleanup(); }
});

test("multiple locations require deliberate selection and reject a forged reference", async ({ page }) => {
  const account = await seedAccount(2);
  try {
    await login(page, account);
    await expect(page).toHaveURL(/\/workspaces$/);
    await expect(page.getByRole("heading", { name: "Çalışma alanını seçin" })).toBeVisible();
    await page.getByRole("button", { name: /Studio E2E.*Bolu/ }).click();
    await expectReady(page);
    await page.context().addCookies([{ name: "elifora-workspace", value: "foreign-membership:foreign-location", url: "http://127.0.0.1:4173" }]);
    await page.reload();
    await expect(page).toHaveURL(/\/workspaces\?reason=TENANT_CONTEXT_INVALID/);
    await expect(page.getByRole("heading", { name: "Çalışma alanınız hazır." })).toHaveCount(0);
    expect((await page.context().cookies()).some(c => c.name === "elifora-workspace")).toBe(false);
  } finally { await account.cleanup(); }
});

test("revocation removes an existing session's workspace without deleting its auth account", async ({ page }) => {
  test.setTimeout(60000);
  const account = await seedAccount();
  try {
    await login(page, account);
    await expectReady(page);
    await account.revoke();
    await expect(page).toHaveURL(/\/workspaces\?reason=/, { timeout: 25000 });
    await expect(page.getByRole("heading", { name: "Henüz bir çalışma alanına erişiminiz yok." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Çalışma alanınız hazır." })).toHaveCount(0);
    expect((await page.context().cookies()).some(c => c.name === "elifora-workspace")).toBe(false);
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/workspaces/);
  } finally { await account.cleanup(); }
});

test("account without membership receives no-access screen", async ({ page }) => {
  const account = await seedAccount(0);
  try {
    await login(page, account);
    await expect(page.getByRole("heading", { name: "Henüz bir çalışma alanına erişiminiz yok." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Oturumu kapat" })).toBeVisible();
  } finally { await account.cleanup(); }
});

test("invalid credentials produce a useful error", async ({ page }) => {
  const account = await seedAccount();
  try {
    await login(page, { email: account.email, password: "incorrect-password" });
    await expect(page.getByRole("alert")).toContainText("E-posta veya parola hatalı");
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/sign-in/);
  } finally { await account.cleanup(); }
});

test("expired cached access token is refreshed by real Supabase Auth", async ({ page }) => {
  const account = await seedAccount();
  try {
    await login(page, account); await expectReady(page);
    // Stop page requests before editing SDK expiry metadata to avoid refresh races.
    await page.goto("about:blank");
    const cookies = (await page.context().cookies()).filter(c => c.name.includes("-auth-token")).sort((a,b) => a.name.localeCompare(b.name));
    const encoded = cookies.map(c => c.value).join("");
    const session = JSON.parse(Buffer.from(encoded.slice("base64-".length), "base64url").toString());
    const oldRefresh = session.refresh_token;
    session.expires_at = 1;
    const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
    await page.context().clearCookies({ name: /.*-auth-token.*/ });
    const first = cookies[0];
    if (!first) throw new Error("Expected restored auth session");
    const base = first.name.replace(/\.\d+$/, "");
    for (let offset = 0; offset < value.length; offset += 3180) {
      await page.context().addCookies([{ ...first, name: value.length > 3180 ? base + "." + (offset / 3180) : base, value: value.slice(offset, offset + 3180) }]);
    }
    await page.goto("/workspace"); await expectReady(page);
    const next = (await page.context().cookies()).filter(c => c.name.includes("-auth-token")).sort((a,b) => a.name.localeCompare(b.name)).map(c => c.value).join("");
    const refreshed = JSON.parse(Buffer.from(next.slice("base64-".length), "base64url").toString());
    expect(refreshed.expires_at > Date.now() / 1000).toBe(true);
    // Avoid assertions printing the secret itself on failure.
    expect(refreshed.refresh_token !== oldRefresh).toBe(true);
  } finally { await account.cleanup(); }
});

test("offline workspace is concealed and retry revalidates", async ({ page }) => {
  const account = await seedAccount();
  try {
    await login(page, account); await expectReady(page);
    await page.context().setOffline(true);
    await expect(page.getByRole("heading", { name: "Çalışma alanınız hazır." })).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("Bağlantı kurulamadı");
    await page.context().setOffline(false);
    await expectReady(page);
  } finally { await page.context().setOffline(false); await account.cleanup(); }
});
