import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { assertOrigin } from "@/lib/live/http";
import { readSalon, mutateSalon, searchSlots, readPrecheck } from "./service";
import { salonError } from "./model";
export async function salonResponse(request: Request, endpoint: "main" | "slots" | "precheck" = "main", id?: string) {
 const correlationId = crypto.randomUUID(), headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
 try {
  const url = new URL(request.url), ref = request.headers.get("x-workspace-reference");let result;
  if (request.method === "GET") {
   if (endpoint === "precheck" && id && !url.search) result = await readPrecheck(id, correlationId);
   else if (endpoint === "main" && [...url.searchParams.keys()].every(k => ["from", "to"].includes(k)) && url.searchParams.getAll("from").length === 1 && url.searchParams.getAll("to").length === 1) result = await readSalon(url.searchParams.get("from")!, url.searchParams.get("to")!, correlationId);
   else throw new AccessError("VALIDATION_FAILED", 400);
  } else {
   assertOrigin(request);
   if (request.method !== "POST" || url.search || endpoint === "precheck" || request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") throw new AccessError("VALIDATION_FAILED", 400);
   const reader = request.body?.getReader(), chunks: Uint8Array[] = [];let size = 0;
   if (reader) try { for (;;) { const { done, value } = await reader.read();if (done) break;size += value.byteLength;if (size > 65536) { await reader.cancel();throw new AccessError("VALIDATION_FAILED", 400); }chunks.push(value); } } finally { reader.releaseLock(); }
   let raw;try { raw = JSON.parse(await new Blob(chunks as BlobPart[]).text()); } catch { throw new AccessError("VALIDATION_FAILED", 400); }
   result = endpoint === "slots" ? await searchSlots(raw, correlationId, ref) : await mutateSalon(raw, correlationId, ref);
  }
  return Response.json(result, { headers });
 } catch (e) { const error = e instanceof AccessError && salonError.shape.code.options.some(code=>code===e.code) ? e : new AccessError("NETWORK_ERROR", 503);return Response.json({ code: error.code, message: error.code, correlationId }, { status: error.status, headers }); }
}
