import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

// Test runner only. Never imported by app code; only disposable local Supabase is accepted.
export async function seedAccount(locationCount = 1) {
  const path = process.env.ELIFORA_TEST_STATUS_FILE;
  if (!path) throw new Error("Real auth E2E requires local Supabase and ELIFORA_TEST_STATUS_FILE; see setup.md.");
  const status = JSON.parse(readFileSync(path, "utf8"));
  if (status.API_URL !== "http://127.0.0.1:54321") throw new Error("Refusing non-local test database");
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const id = randomUUID();
  const email = `e2e-${id}@elifora.test`;
  const password = `E2e-${randomUUID()}!`;
  const organizationId = randomUUID();
  const membershipId = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Local test user creation failed");
  const userId = data.user.id;
  const check = (result: { error: unknown }) => { if (result.error) throw new Error("Local tenancy fixture failed"); };
  check(await admin.from("organizations").insert({ id: organizationId, name: "Studio E2E", slug: `e2e-${id}`, base_currency: "TRY" }));
  const locations = Array.from({ length: locationCount }, (_, i) => ({
    id: randomUUID(), organization_id: organizationId, name: i === 0 ? "Bolu" : "İzmit", timezone: "Europe/Istanbul",
  }));
  if (locations.length) check(await admin.from("locations").insert(locations));
  if (locationCount) check(await admin.from("salon_memberships").insert({
    id: membershipId, organization_id: organizationId, user_id: userId,
    location_id: null, role_code: "owner", status: "active", joined_at: new Date().toISOString(),
  }));
  return {
    email, password, membershipId, locations,
    async revoke() {
      check(await admin.from("salon_memberships").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", membershipId));
    },
    async cleanup() {
      check(await admin.from("salon_memberships").delete().eq("organization_id", organizationId));
      check(await admin.from("locations").delete().eq("organization_id", organizationId));
      check(await admin.from("organizations").delete().eq("id", organizationId));
      check(await admin.auth.admin.deleteUser(userId));
    },
  };
}
export async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("E-posta").fill(account.email);
  await page.getByLabel("Parola", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Oturum aç", exact: true }).click();
}
export async function expectReady(page: Page) {
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Çalışma alanınız hazır." })).toBeVisible();
  await expect(page.getByText("Studio E2E · Bolu")).toBeVisible();
}
