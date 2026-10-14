import { createHmac } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { verifiedClientContext } from "@/lib/clients/service";
import { AccessError } from "@/lib/tenant/bootstrap";
import { assertOrigin } from "@/lib/live/http";
import { legacyEncryptionPublicKey, unwrapLegacyKey } from "@/lib/offline/server-keywrap";
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
  return Response.json({ user_id: data.user.id, device_id: device, context, key, legacy_public_key: legacyEncryptionPublicKey(secret) }, { headers });
 } catch (e) {
  const known = e instanceof AccessError ? e : new AccessError(e instanceof z.ZodError ? "VALIDATION_FAILED" : "NETWORK_ERROR", e instanceof z.ZodError ? 400 : 503);
  return Response.json({ code: known.code, correlationId }, { headers, status: known.status });
 }
}
const wrapped = z.strictObject({ scope: z.string().max(160), ephemeral_public_key: z.string().regex(/^04[a-f0-9]{128}$/), iv: z.string().regex(/^[a-f0-9]{24}$/), wrapped_key: z.string().regex(/^[a-f0-9]{96}$/) });
export async function POST(request: Request) {
 const correlationId = crypto.randomUUID(), headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
 try {
  assertOrigin(request); const body = await request.text(); if (body.length > 4096) throw new AccessError("VALIDATION_FAILED", 400);
  const input = wrapped.parse(JSON.parse(body)), parts = z.uuid().array().length(4).parse(input.scope.split(":"));
  const context = await verifiedClientContext("live_session.view");
  if (context.membership_id !== parts[0] || context.location_id !== parts[1]) throw new AccessError("FORBIDDEN", 403);
  const client = await createClient(), auth = await client.auth.getUser(); if (auth.error || !auth.data.user) throw new AccessError("SESSION_EXPIRED", 401);
  const secret = process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY; if (!secret) throw new AccessError("NETWORK_ERROR", 503);
  const key = unwrapLegacyKey(secret, input);
  const latest = await verifiedClientContext("live_session.view"); if (JSON.stringify(context) !== JSON.stringify(latest)) throw new AccessError("TENANT_CONTEXT_INVALID", 403);
  return Response.json({ key }, { headers });
 } catch (error) {
  const known = error instanceof AccessError ? error : new AccessError("VALIDATION_FAILED", 400);
  return Response.json({ code: known.code, correlationId }, { headers, status: known.status });
 }
}
