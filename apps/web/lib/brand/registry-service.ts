import "server-only";
import { verifiedClientContext } from "@/lib/clients/service";
import { createClient } from "@/lib/supabase/server";
import { AccessError } from "@/lib/tenant/bootstrap";
import { workspaceReference } from "@/lib/tenant/context";
import { registryPage, registryQuery } from "./registry-model";

export async function readColorRegistry(raw: unknown, correlationId: string) {
 const parsed = registryQuery.safeParse(raw);
 if (!parsed.success) throw new AccessError("VALIDATION_FAILED", 400);
 const q = parsed.data;
 const context = await verifiedClientContext("color_plan.read");
 const client = await createClient();
 const { data, error } = await client.rpc("color_registry_browse", {
  p_query: q.query, p_brand: q.brand ?? null, p_region: q.region ?? null, p_state: q.state ?? null, p_offset: q.offset, p_limit: q.limit,
 });
 if (error) throw new AccessError(error.code === "42501" ? "FORBIDDEN" : "NETWORK_ERROR", error.code === "42501" ? 403 : 503);
 const page = registryPage.safeParse(data);
 if (!page.success) throw new AccessError("BRAND_CATALOG_INVALID", 503);
 const current = await verifiedClientContext("color_plan.read");
 if (workspaceReference(context) !== workspaceReference(current)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
 return { data: page.data, correlationId };
}
