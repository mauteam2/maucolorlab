import { describe, expect, it } from "vitest";
import { clientCommand, clientDirectory, errorStatus, permissionFor } from "./contracts";
const id = "70000000-0000-4000-8000-000000000001";
const identity = { full_name: "Ayşe Yılmaz", phone: "05321234567", request_id: id };
describe("client command boundary", () => {
  it("accepts only the minimal creation fields and defaults the phone region", () => {
    expect(clientCommand.parse({ operation: "create", payload: identity }).payload).toHaveProperty("phone_region", "TR");
  });
  it.each(["full_name", "phone", "request_id"])("requires %s", field => {
    const payload: Record<string, unknown> = { ...identity }; delete payload[field];
    expect(clientCommand.safeParse({ operation: "create", payload }).success).toBe(false);
  });
  it.each(["organization_id", "created_by", "role", "location_id"])("rejects forged %s", field => {
    expect(clientCommand.safeParse({ operation: "create", payload: { ...identity, [field]: id } }).success).toBe(false);
  });
  it("accepts explicit server review token and preserves idempotency key", () => {
    expect(clientCommand.parse({ operation: "create", payload: { ...identity, confirmation_token: id } }).payload).toHaveProperty("request_id", id);
  });
  it("requires version for edit and archive", () => {
    expect(clientCommand.safeParse({ operation: "update", payload: { ...identity, client_id: id } }).success).toBe(false);
    expect(clientCommand.safeParse({ operation: "archive", payload: { client_id: id, request_id: id } }).success).toBe(false);
  });
  it("bounds list/search pagination", () => {
    expect(clientCommand.safeParse({ operation: "list", payload: { limit: 51 } }).success).toBe(false);
    expect(clientCommand.safeParse({ operation: "list", payload: { query: "a".repeat(81) } }).success).toBe(false);
    expect(clientCommand.parse({ operation: "list", payload: { query: "0532", status: "ARCHIVED", offset: 25 } }).operation).toBe("list");
  });
  it("does not retain private fields in directory responses", () => {
    const result = clientDirectory.parse({ items: [{ id, full_name: "Ayşe", phone_masked: "+90••••567", updated_at: "2026-09-11", status: "ACTIVE", email: "private@example.test" }], has_more: false, offset: 0 });
    expect(result.items[0]).not.toHaveProperty("email");
  });
  it("maps permissions and duplicate review to a non-fatal conflict", () => {
    expect(permissionFor("restore")).toBe("clients.archive"); expect(permissionFor("detail")).toBe("clients.read");
    expect(errorStatus("DUPLICATE_CLIENT_CANDIDATES")).toBe(409); expect(errorStatus("CLIENT_NOT_FOUND")).toBe(404);
  });
});
