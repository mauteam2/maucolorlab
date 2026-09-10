import { describe, expect, it } from "vitest";
import { resolveSelection, selectionError, tenantContextSchema, workspaceReference, type ActiveTenantContext } from "./context";
const context: ActiveTenantContext = {
  membership_id: "10000000-0000-4000-8000-000000000001", organization_id: "20000000-0000-4000-8000-000000000001",
  organization_name: "Salon A", location_id: "30000000-0000-4000-8000-000000000001", location_name: "Bolu",
  role: "owner", membership_status: "active", permissions: ["membership.read"],
};
describe("verified workspace selection", () => {
  it("auto-selects a single context", () => expect(resolveSelection([context])).toEqual(context));
  it("requires selection for multiple locations", () => expect(resolveSelection([context, { ...context, location_id: "other" }])).toBeUndefined());
  it("restores only a reference in the fresh server result", () => expect(resolveSelection([context], workspaceReference(context))).toEqual(context));
  it("does not fall back from a manipulated reference to another workspace", () => expect(resolveSelection([context], "organization-b")).toBeUndefined());
  it("removes a revoked cached selection", () => expect(resolveSelection([], workspaceReference(context))).toBeUndefined());
  it("distinguishes absent, removed and invalid selection", () => {
    expect(selectionError([])).toBe("MEMBERSHIP_REQUIRED");
    expect(selectionError([], "old")).toBe("MEMBERSHIP_REVOKED");
    expect(selectionError([context], "foreign")).toBe("TENANT_CONTEXT_INVALID");
  });
  it("rejects inactive memberships and unrecognized roles", () => {
    expect(tenantContextSchema.safeParse({ ...context, membership_status: "revoked" }).success).toBe(false);
    expect(tenantContextSchema.safeParse({ ...context, role: "admin" }).success).toBe(false);
  });
});
