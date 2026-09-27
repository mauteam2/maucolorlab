import { clientDetail } from "@/lib/clients/contracts";
import { tenantContextSchema, workspaceReference } from "@/lib/tenant/context";
import { hairReadResult, type HairReadOptions } from "./contracts";
export class PassportLoadError extends Error { constructor(public code: string) { super(code); } }
export async function loadPassport(clientId: string, options: HairReadOptions, signal: AbortSignal) {
 async function json(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, cache: "no-store", signal });
  const body = await response.json();
  if (response.status === 401) throw new PassportLoadError("SESSION_EXPIRED");
  if (!response.ok && body.code !== "HAIR_PASSPORT_NOT_FOUND") throw new PassportLoadError(body.code ?? "NETWORK_ERROR");
  return body;
 }
 const first = tenantContextSchema.parse((await json("/api/session")).context);
 if (!first.permissions.includes("hair_passport.read")) throw new PassportLoadError("FORBIDDEN");
 const reference = workspaceReference(first);
 const detail = await json("/api/clients", { method: "POST", headers: { "Content-Type": "application/json", "X-Workspace-Reference": reference }, body: JSON.stringify({ operation: "detail", payload: { client_id: clientId } }) });
 if (detail.code) throw new PassportLoadError(detail.code);
 if (workspaceReference(tenantContextSchema.parse(detail.context)) !== reference) throw new PassportLoadError("TENANT_CONTEXT_INVALID");
 const client = clientDetail.parse(detail.data);
 if (client.id !== clientId || client.organization_id !== first.organization_id) throw new PassportLoadError("NETWORK_ERROR");
 const query = new URLSearchParams({ page_size: "10", tests_offset: String(options.tests_offset ?? 0), history_offset: String(options.history_offset ?? 0), include_archived: String(client.status === "ARCHIVED") });
 const result = hairReadResult.parse(await json(`/api/clients/${clientId}/hair-passport?${query}`));
 if ("code" in result && result.code !== "HAIR_PASSPORT_NOT_FOUND") throw new PassportLoadError(result.code);
 const last = tenantContextSchema.parse((await json("/api/session")).context);
 if (workspaceReference(last) !== reference) throw new PassportLoadError("TENANT_CONTEXT_INVALID");
 if (!last.permissions.includes("hair_passport.read")) throw new PassportLoadError("FORBIDDEN");
 const snapshot = "data" in result ? result.data : null;
 if (snapshot && (snapshot.passport.client_id !== clientId || snapshot.passport.client_status !== client.status || snapshot.physical_tests.offset !== (options.tests_offset ?? 0) || snapshot.history.offset !== (options.history_offset ?? 0) || snapshot.physical_tests.page_size !== 10 || snapshot.history.page_size !== 10)) throw new PassportLoadError("NETWORK_ERROR");
 return { client, snapshot };
}
