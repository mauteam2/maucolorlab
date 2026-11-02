import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { devices, expect, test, type Page, type TestInfo } from "@playwright/test";
import { seedAccount, login, expectReady } from "./local-auth";
const origin = "http://127.0.0.1:4173";
function reviewOptions(info: TestInfo) { return { ...devices[info.project.name === "mobile-chromium" ? "Pixel 7" : "Desktop Chrome"], baseURL: origin, reducedMotion: "reduce" as const }; }
function provider() {
  const status = JSON.parse(readFileSync(process.env.ELIFORA_TEST_STATUS_FILE!, "utf8"));
  if (status.API_URL !== "http://127.0.0.1:54321") throw Error("Disposable local Auth required");
  return { status, admin: createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) };
}
async function capture(page: Page, info: TestInfo, state: string, width: number) {
  await page.setViewportSize({ width, height: 960 });
  await expect(page.locator(".entry-private-lock")).toHaveCount(0);
  await expect(page.locator("#main-content h1")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`ui-ux-pass5b-${state}-${width}.png`), fullPage: true });
}
async function invite(page: Page, role: "colorist" | "reception" = "colorist") {
  const owner = await seedAccount(); await login(page, owner); await expectReady(page);
  const ctx = (await (await page.request.get("/api/session")).json()).context;
  const { admin } = provider(), email = `entry-${randomUUID()}@example.invalid`, password = `Synthetic-${randomUUID()}!`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw Error("Synthetic provider identity failed");
  const id = randomUUID();
  const created = await page.request.post("/api/saas/structure", { headers: { origin, "x-workspace-reference": `${ctx.membership_id}:${ctx.location_id}` }, data: {
    type: "CREATE_MEMBER", id, request_id: randomUUID(), user_id: made.data.user.id, role, location_id: ctx.location_id,
  } });
  expect(created.status(), await created.text()).toBe(200);
  return { owner, ctx, id, email, password, admin };
}

test("branded sign-in, password semantics, neutral recovery and public signup boundary", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/sign-in");
  for (const width of [1440, 390, 320]) await capture(page, info, "sign-in", width);
  expect(await page.getByLabel("E-posta", { exact: true }).getAttribute("autocomplete")).toBe("username");
  const password = page.getByLabel("Parola", { exact: true }); expect(await password.getAttribute("autocomplete")).toBe("current-password");
  await page.getByRole("button", { name: "Parolayı göster", exact: true }).click(); await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Parolayı gizle", exact: true }).click(); await expect(password).toHaveAttribute("type", "password");
  await page.getByLabel("E-posta", { exact: true }).focus(); await page.keyboard.press("Tab"); await expect(password).toBeFocused();
  // Small viewport models keyboard occlusion without inventing a device-keyboard claim.
  await page.setViewportSize({ width: 320, height: 480 }); await password.focus();
  await page.getByRole("button", { name: "Oturum aç", exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole("button", { name: "Oturum aç", exact: true })).toBeInViewport();
  await page.goto("/auth/recovery"); await capture(page, info, "forgot-password", 390);
  await page.getByLabel("E-posta", { exact: true }).fill(`unknown-${randomUUID()}@example.invalid`);
  await page.getByRole("button", { name: "Kurtarma bağlantısı iste" }).click();
  await expect(page.getByRole("status")).toContainText("İsteğiniz alındı."); await expect(page.getByRole("status")).not.toContainText("gönderildi");
  await page.goto("/auth/update-password"); await expect(page.getByRole("heading", { name: "Kurtarma oturumu kullanılamıyor" })).toBeVisible();
  expect((await page.request.get("/sign-up")).status()).toBe(404);
  await expect(page.getByRole("link", { name: /Kayıt ol|Ücretsiz başla|Salonunu oluştur/i })).toHaveCount(0);
});

test("staff reviews own invitation, no workspace before acceptance, double-submit and canonical retry", async ({ page, browser }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); const f = await invite(page);
  const isolated = await browser.newContext(reviewOptions(info));
  try {
    const staff = await isolated.newPage(); await login(staff, f); await expect(staff).toHaveURL(/\/invitations$/);
    await expect(staff.getByText("Renk Uzmanı / Kuaför", { exact: true })).toBeVisible();
    expect((await isolated.request.get("/api/session")).status()).toBe(403);
    for (const width of [1440, 390, 320]) await capture(staff, info, "pending-staff-invite", width);
    expect(await staff.locator("#main-content").innerText()).not.toContain(f.id);
    await expect(staff.getByRole("combobox")).toHaveCount(0);
    const posts: { request_id: string }[] = [];
    staff.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname === `/api/membership-invitations/${f.id}`) posts.push(r.postDataJSON()); });
    await staff.getByRole("button", { name: "Daveti kabul et", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(staff.getByRole("heading", { name: "Davet kabul edildi", exact: true })).toBeVisible();
    expect(posts).toHaveLength(1); expect(Object.keys(posts[0]!)).toEqual(["request_id"]);
    await capture(staff, info, "invite-accepted", 1440);
    const first = await isolated.request.get(`/api/membership-invitations/${f.id}`); const joined = (await first.json()).data[0].joined_at;
    const retry = await isolated.request.post(`/api/membership-invitations/${f.id}`, { headers: { origin }, data: posts[0] });
    expect(retry.status()).toBe(200); expect((await retry.json()).data.joined_at).toBe(joined);
    await staff.getByRole("button", { name: "Çalışma alanına devam et" }).click(); await expectReady(staff);
    const ctx = (await (await isolated.request.get("/api/session")).json()).context;
    expect(ctx.role).toBe("colorist"); expect(ctx.permissions).not.toContain("memberships.manage");
    expect((await (await isolated.request.get("/api/membership-invitations")).json()).data).toEqual([]);
    await staff.goto("/welcome"); await expect(staff).toHaveURL(/\/auth\/access\?reason=FORBIDDEN$/); await expect(staff.getByRole("heading", { name: "Bu bölüm için yetkiniz yok" })).toBeVisible();
  } finally { await isolated.close(); await f.owner.cleanup(); }
});

test("revoked, unavailable and foreign invitation states never offer unsafe acceptance", async ({ page, browser }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); const f = await invite(page, "reception");
  const isolated = await browser.newContext(reviewOptions(info));
  try {
    const staff = await isolated.newPage(); await login(staff, f); await expect(staff).toHaveURL(/\/invitations$/);
    await page.goto(`/invite/${f.id}`); await expect(page.getByRole("heading", { name: "Bu davet kullanılamıyor" })).toBeVisible(); const foreign = await page.locator("#main-content").innerText();
    await page.goto(`/invite/${randomUUID()}`); expect(await page.locator("#main-content").innerText()).toBe(foreign); await capture(page, info, "invalid-invite", 1440);
    const archive = await f.admin.from("locations").update({ archived_at: new Date().toISOString() }).eq("id", f.ctx.location_id); expect(archive.error).toBeNull();
    await staff.goto(`/invite/${f.id}`); await expect(staff.getByText("Konum kullanılamıyor", { exact: true })).toBeVisible(); await expect(staff.getByRole("button", { name: "Daveti kabul et" })).toHaveCount(0); await capture(staff, info, "unavailable-invite", 1440);
    const restore = await f.admin.from("locations").update({ archived_at: null }).eq("id", f.ctx.location_id); expect(restore.error).toBeNull();
    const archiveOrg = await f.admin.from("organizations").update({ archived_at: new Date().toISOString() }).eq("id", f.ctx.organization_id); expect(archiveOrg.error).toBeNull();
    await staff.reload(); await expect(staff.getByText("Salon kullanılamıyor", { exact: true })).toBeVisible(); await expect(staff.getByRole("button", { name: "Daveti kabul et" })).toHaveCount(0);
    expect((await isolated.request.get("/api/session")).status()).toBe(403);
    expect((await f.admin.from("organizations").update({ archived_at: null }).eq("id", f.ctx.organization_id)).error).toBeNull();
    expect((await f.admin.from("salon_memberships").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", f.id)).error).toBeNull();
    await staff.reload(); await expect(staff.getByText("Artık aktif değil", { exact: true })).toBeVisible(); await capture(staff, info, "revoked-invite", 1440);
    await expect(staff.getByRole("button", { name: "Daveti kabul et" })).toHaveCount(0);
    const blocked = await isolated.request.post(`/api/membership-invitations/${f.id}`, { headers: { origin }, data: { request_id: randomUUID() } }); expect(blocked.status()).toBe(409);
    await staff.getByRole("link", { name: "Çalışma alanına dön" }).click(); await expect(staff.getByRole("heading", { name: "Henüz bir çalışma alanına erişiminiz yok." })).toBeVisible();
  } finally { await isolated.close(); await f.owner.cleanup(); }
});

test("initial owner goes directly to Today, uses existing setup, selects real workspaces and sees true expiry", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); const owner = await seedAccount();
  let accepts = 0; page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/membership-invitations/")) accepts++; });
  try {
    await login(page, owner); await expectReady(page); expect(accepts).toBe(0);
    await page.getByRole("link", { name: "Salon başlangıç rehberi", exact: true }).click(); await expect(page).toHaveURL(/\/welcome$/);
    for (const width of [1440, 320]) await capture(page, info, "initial-owner", width);
    await expect(page.getByText("Henüz çalışma saatleri kaydedilmemiş.", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Bugünkü çalışma alanına geç" }).click(); await expectReady(page); expect(accepts).toBe(0);
    const result = await owner.verifyRevokedSessionRejected(); expect(result.after).toBe(401);
    await page.goto("/workspace"); await expect(page).toHaveURL(/\/sign-in\?reason=SESSION_EXPIRED/); await capture(page, info, "session-expired", 390);
  } finally { await owner.cleanup(); }
  const multiple = await seedAccount(2);
  try { await login(page, multiple); await expect(page).toHaveURL(/\/workspaces$/); for(const width of [1440,390,320]) await capture(page, info, "workspace-selector", width); await page.getByRole("button", { name: /Studio E2E.*Bolu/ }).click(); await expectReady(page); }
  finally { await multiple.cleanup(); }
});

test("authenticated no-access and real provider recovery session preserve identity boundaries", async ({ page, browser }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); const account = await seedAccount(0);
  try {
    await login(page, account); await expect(page.getByRole("heading", { name: "Henüz bir çalışma alanına erişiminiz yok." })).toBeVisible(); await capture(page, info, "no-workspace", 1440);
    await expect(page.getByRole("button", { name: "Oturumu kapat" })).toBeVisible();
    const { status, admin } = provider(); const link = await admin.auth.admin.generateLink({ type: "recovery", email: account.email });
    if (link.error || !link.data.properties.hashed_token) throw Error("Synthetic provider recovery fixture failed");
    const cookies: { name: string; value: string; options: { path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: boolean | "lax" | "strict" | "none" } }[] = [];
    const ssr = createServerClient(status.API_URL, status.ANON_KEY, { cookies: { getAll: () => [], setAll: values => { cookies.push(...values); } } });
    const verified = await ssr.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "recovery" });
    if (verified.error || !verified.data.session) throw Error("Provider recovery verification failed");
    const recovery = await browser.newContext(reviewOptions(info));
    try {
      try { await recovery.addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: origin, httpOnly: c.options.httpOnly ?? false, secure: c.options.secure ?? false, sameSite: typeof c.options.sameSite === "string" ? c.options.sameSite === "strict" ? "Strict" as const : c.options.sameSite === "none" ? "None" as const : "Lax" as const : "Lax" as const }))); }
      catch { throw Error("Synthetic recovery cookie setup failed"); }
      const reset = await recovery.newPage(); await reset.goto("/auth/update-password"); await expect(reset.getByRole("heading", { name: "Yeni parola belirleyin" })).toBeVisible(); await capture(reset, info, "reset-password", 390);
      await reset.getByLabel("Yeni parola", { exact: true }).fill(`New-${randomUUID()}!`); await reset.getByLabel("Parolayı doğrulayın", { exact: true }).fill("Different-password!"); await reset.getByRole("button", { name: "Parolayı güncelle" }).click(); await expect(reset.locator("#main-content").getByRole("alert")).toContainText("Parolalar eşleşmiyor");
      const next = `New-${randomUUID()}!`; await reset.getByLabel("Yeni parola", { exact: true }).fill(next); await reset.getByLabel("Parolayı doğrulayın", { exact: true }).fill(next); await reset.getByRole("button", { name: "Parolayı güncelle" }).click(); await expect(reset.getByRole("status")).toContainText("Parolanız güncellendi. Yeniden oturum açın.");
      expect((await admin.from("salon_memberships").select("id").eq("user_id", account.userId)).data).toEqual([]);
    } finally { await recovery.close(); }
  } finally { await account.cleanup(); }
});
