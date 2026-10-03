import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
vi.mock("@/lib/env/public", () => ({ getPublicEnvironment: () => ({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-publishable-key" }) }));
import { proxy } from "./proxy";
beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.client.mockImplementation((_url, _key, options) => {
    options.cookies.setAll([{ name: "sb-local-auth-token", value: "synthetic-refresh-cookie", options: { httpOnly: true } }], {});
    return { auth: { getUser: mocks.getUser } };
  });
});
it("redirects a server-verified session before the login or intro is rendered, preserving refreshed cookies", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: null });
  const response = await proxy(new NextRequest("http://localhost:3001/sign-in?reason=SESSION_EXPIRED"));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3001/workspaces");
  expect(response.cookies.get("sb-local-auth-token")?.value).toBe("synthetic-refresh-cookie");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it.each([
  { data: { user: null }, error: null },
  { data: { user: { id: "unverified" } }, error: { message: "Invalid session" } },
])("does not redirect an absent or unverified session", async result => {
  mocks.getUser.mockResolvedValue(result);
  const response = await proxy(new NextRequest("http://localhost:3001/sign-in"));
  expect(response.headers.get("location")).toBeNull();
});
it("keeps normal authenticated navigation unchanged", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: null });
  const response = await proxy(new NextRequest("http://localhost:3001/workspace"));
  expect(response.headers.get("location")).toBeNull();
});
it("allows a sign-in server action to process its POST instead of redirecting its body", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user" } }, error: null });
  const response = await proxy(new NextRequest("http://localhost:3001/sign-in", { method: "POST" }));
  expect(response.headers.get("location")).toBeNull();
});
