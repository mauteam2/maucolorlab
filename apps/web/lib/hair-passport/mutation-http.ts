import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { mutateHairPassport } from "./mutation-service";
import type { HairMutationOperation } from "./mutations";

type MutationExecutor = (input: unknown, correlationId: string, expectedReference?: string | null) => Promise<{ data: unknown; correlationId: string }>;
export async function hairMutationResponse(request: Request, params: Promise<{ clientId: string; regionId?: string }>, operation: HairMutationOperation | "add_observation", execute: MutationExecutor = mutateHairPassport) {
 const correlationId = crypto.randomUUID();
 const headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
 try {
  let sameOrigin = false;
  try { sameOrigin = new URL(request.headers.get("origin") ?? "").origin === new URL(request.url).origin; } catch { /* malformed origin is denied */ }
  if (!sameOrigin) throw new AccessError("FORBIDDEN", 403);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || new URL(request.url).search)
   throw new AccessError("VALIDATION_FAILED", 400);
  // Bound streamed bytes as well as Content-Length; do not buffer an unbounded body.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
   try {
    for (;;) {
     const { value, done } = await reader.read(); if (done) break;
     size += value.byteLength;
     if (size > 32768) { await reader.cancel(); throw new AccessError("VALIDATION_FAILED", 400); }
     chunks.push(value);
    }
   } finally { reader.releaseLock(); }
  }
  let body: unknown;
  try { body = JSON.parse(await new Blob(chunks as BlobPart[]).text()); } catch { throw new AccessError("VALIDATION_FAILED", 400); }
  const { clientId, regionId } = await params;
  const result = await execute({ operation, client_id: clientId, ...(operation === "update_region" ? { region_id: regionId } : {}), payload: body }, correlationId, request.headers.get("x-workspace-reference"));
  return Response.json(result, { headers });
 } catch (error) {
  const known = error instanceof AccessError ? error : new AccessError("NETWORK_ERROR", 503);
  return Response.json({ code: known.code, message: known.code, correlationId }, { headers, status: known.status });
 }
}
