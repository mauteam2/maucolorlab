import { expect, it } from "vitest";
import { GET } from "./route";
it("resets only the workspace reference and preserves the browser origin", () => {
  const response = GET();
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toBe("/workspaces?reason=TENANT_CONTEXT_INVALID");
  expect(response.headers.get("Set-Cookie")).toContain("elifora-workspace=;");
  expect(response.headers.get("Set-Cookie")).not.toContain("auth-token");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
