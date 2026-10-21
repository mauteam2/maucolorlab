import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { readColorRegistry } from "./registry-service";

export async function registryResponse(request: Request, read = readColorRegistry) {
 const correlationId = crypto.randomUUID();
 const headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
 try {
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some(key => search.getAll(key).length !== 1)) throw new AccessError("VALIDATION_FAILED", 400);
  return Response.json(await read(Object.fromEntries(search), correlationId), { headers });
 } catch (error) {
  const e = error instanceof AccessError ? error : new AccessError("NETWORK_ERROR", 503);
  return Response.json({ code: e.code, message: e.code, correlationId }, { status: e.status, headers });
 }
}
