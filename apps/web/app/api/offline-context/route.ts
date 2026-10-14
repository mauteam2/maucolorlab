import { createHmac } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { AccessError } from "@/lib/tenant/bootstrap";
export async function GET(request: Request) {
 const correlationId = crypto.randomUUID();
 const headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
 try {
  const device = z.uuid().parse(new URL(request.url).searchParams.get("device_id"));
  const context = await verifiedClientContext("clients.read"), client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AccessError("SESSION_EXPIRED", 401);
  const secret = process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new AccessError("NETWORK_ERROR", 503);
  // Domain-separated derived AES key. The signing/provider secret never leaves
  // the server. Nothing is persisted in browser storage except ciphertext.
  const key = createHmac("sha256", Buffer.from(secret, "hex"))
   .update(JSON.stringify(["elifora/offline-vault/v1", data.user.id, context.organization_id, context.location_id, context.membership_id, device])).digest("hex");
  const latest = await verifiedClientContext("clients.read");
  if (JSON.stringify(latest) !== JSON.stringify(context)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
  return Response.json({ user_id: data.user.id, device_id: device, context, key }, { headers });
 } catch (e) {
  const known = e instanceof AccessError ? e : new AccessError(e instanceof z.ZodError ? "VALIDATION_FAILED" : "NETWORK_ERROR", e instanceof z.ZodError ? 400 : 503);
  return Response.json({ code: known.code, correlationId }, { headers, status: known.status });
 }
}
