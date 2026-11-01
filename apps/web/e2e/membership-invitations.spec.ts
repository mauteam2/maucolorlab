import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectReady, login, seedAccount } from "./local-auth";

test("authenticated invited recipient accepts through real service and fresh workspace bootstrap", async ({ page, browser }) => {
  const owner = await seedAccount(); await login(page, owner); await expectReady(page);
  const context = (await (await page.request.get("/api/session")).json()).context;
  const status = JSON.parse(readFileSync(process.env.ELIFORA_TEST_STATUS_FILE!, "utf8"));
  if (status.API_URL !== "http://127.0.0.1:54321") throw new Error("Disposable local Auth required");
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `invitation-${randomUUID()}@example.invalid`, password = `Synthetic-${randomUUID()}!`;
  const provider = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (provider.error || !provider.data.user) throw new Error("Synthetic identity creation failed");
  const membershipId = randomUUID(), origin = "http://127.0.0.1:4173";
  // Real existing owner CREATE_MEMBER is the only application invitation source.
  const create = await page.request.post("/api/saas/structure", { headers: { origin, "x-workspace-reference": `${context.membership_id}:${context.location_id}` }, data: {
    type: "CREATE_MEMBER", id: membershipId, request_id: randomUUID(), user_id: provider.data.user.id, role: "reception", location_id: context.location_id,
  } });
  expect(create.status(), await create.text()).toBe(200);
  const isolated = await browser.newContext({ baseURL: origin });
  try {
    const invited = await isolated.newPage(); await login(invited, { email, password });
    await expect(invited).toHaveURL(/\/workspaces$/);
    const pending = await isolated.request.get("/api/membership-invitations");
    expect(pending.status(), await pending.text()).toBe(200);
    const list = (await pending.json()).data;
    expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ membership_id: membershipId, role_code: "reception", state: "PENDING" });
    expect(Object.keys(list[0]).sort()).toEqual(["membership_id", "organization_name", "location_name", "role_code", "status", "invited_at", "joined_at", "state"].sort());
    expect((await isolated.request.get("/api/session")).status()).toBe(403);
    const headers = { origin }, path = `/api/membership-invitations/${membershipId}`, data = { request_id: randomUUID() };
    const forged = await isolated.request.post(path, { headers, data: { ...data, role: "owner" } }); expect(forged.status()).toBe(400);
    const foreign = await page.request.post(path, { headers, data }); expect(foreign.status()).toBe(404);
    expect((await foreign.json()).code).toBe("INVITATION_NOT_FOUND");
    const accepted = await isolated.request.post(path, { headers, data });
    expect(accepted.status(), await accepted.text()).toBe(200);
    const canonical = await accepted.json();
    expect(canonical.data).toMatchObject({ membership_id: membershipId, role_code: "reception", state: "ACTIVE" });
    expect(canonical.workspaces).toHaveLength(1); expect(canonical.workspaces[0].membership_id).toBe(membershipId);
    expect(canonical.workspaces[0].permissions).not.toContain("hair_passport.read");
    const retry = await isolated.request.post(path, { headers, data });
    expect(retry.status()).toBe(200); expect((await retry.json()).data).toEqual(canonical.data);
    expect((await (await isolated.request.get("/api/membership-invitations")).json()).data).toEqual([]);
    await invited.goto("/workspaces"); await expect(invited).toHaveURL(/\/workspace$/);
    const active = await isolated.request.get("/api/session"); expect(active.status()).toBe(200);
    expect((await active.json()).context.role).toBe("reception");
    // Revocation through the pre-existing test-only admin fixture path.
    const revoke = await admin.from("salon_memberships").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", membershipId);
    expect(revoke.error).toBeNull();
    const stale = await isolated.request.post(path, { headers, data }); expect(stale.status()).toBe(409); expect((await stale.json()).code).toBe("INVITATION_REVOKED");
    expect((await isolated.request.get("/api/session")).status()).toBe(403);
    expect((await page.request.get("/sign-up")).status()).toBe(404);
  } finally { await isolated.close(); await owner.cleanup(); }
});
