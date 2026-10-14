import { AccessError } from "@/lib/tenant/bootstrap";
import { assertOrigin } from "@/lib/live/http";
import { executeSaas } from "@/lib/saas/service";

async function respond(request: Request) {
  const correlationId = crypto.randomUUID(), headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
  try {
    if (new URL(request.url).search) throw new AccessError("VALIDATION_FAILED", 400);
    let command;
    if (request.method === "POST") {
      assertOrigin(request);
      if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new AccessError("VALIDATION_FAILED", 400);
      const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
      if (reader) try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 4096) { await reader.cancel(); throw new AccessError("VALIDATION_FAILED", 400); } chunks.push(value); } } finally { reader.releaseLock(); }
      try { command = JSON.parse(await new Blob(chunks as BlobPart[]).text()); } catch { throw new AccessError("VALIDATION_FAILED", 400); }
    }
    return Response.json(await executeSaas(command, correlationId, request.method === "POST" ? request.headers.get("x-workspace-reference") : undefined), { headers });
  } catch (e) { const failure = e instanceof AccessError ? e : new AccessError("NETWORK_ERROR", 503); return Response.json({ code: failure.code, correlationId }, { status: failure.status, headers }); }
}
export const GET = respond;
export const POST = respond;
