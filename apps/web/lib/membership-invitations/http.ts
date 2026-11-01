import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { assertOrigin } from "@/lib/live/http";
import { acceptMyInvitation, readMyInvitations } from "./service";

export async function invitationResponse(request: Request, id?: string) {
  const correlationId = crypto.randomUUID();
  const headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
  try {
    if (new URL(request.url).search) throw new AccessError("VALIDATION_FAILED", 400);
    if (request.method === "GET") return Response.json({ ...await readMyInvitations(id), correlationId }, { headers });
    assertOrigin(request);
    if (request.method !== "POST" || !id || request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") throw new AccessError("VALIDATION_FAILED", 400);
    const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
    if (reader) try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); throw new AccessError("VALIDATION_FAILED", 400); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let raw: unknown;
    try { raw = JSON.parse(await new Blob(chunks as BlobPart[]).text()); } catch { throw new AccessError("VALIDATION_FAILED", 400); }
    // The path owns the membership locator. Body permits only request_id.
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 1 || !("request_id" in raw)) throw new AccessError("VALIDATION_FAILED", 400);
    return Response.json(await acceptMyInvitation({ membership_id: id, request_id: raw.request_id }, correlationId), { headers });
  } catch (e) {
    const failure = e instanceof AccessError ? e : new AccessError("NETWORK_ERROR", 503);
    return Response.json({ code: failure.code, message: failure.code, correlationId }, { status: failure.status, headers });
  }
}
