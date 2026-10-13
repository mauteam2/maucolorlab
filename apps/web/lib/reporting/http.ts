import "server-only";
import { assertOrigin } from "@/lib/live/http";
import { AccessError } from "@/lib/tenant/bootstrap";
import { executeReport } from "./service";
import { reportCsv } from "./csv";
import { reportSummary } from "./model";
export async function reportingResponse(request: Request) {
  const correlationId = crypto.randomUUID(), headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
  try {
    const url = new URL(request.url); let result;
    if (request.method === "GET") {
      const keys = ["kind", "period", "from", "until", "staff_user_id", "service_id", "category", "cursor", "domain", "segment", "source_id"];
      if ([...url.searchParams.keys()].some(k => !keys.includes(k) || url.searchParams.getAll(k).length !== 1)) throw new AccessError("VALIDATION_FAILED", 400);
      const q: Record<string, unknown> = Object.fromEntries(url.searchParams);
      if (typeof q.cursor === "string") { try { q.cursor = JSON.parse(q.cursor); } catch { throw new AccessError("VALIDATION_FAILED", 400); } }
      result = await executeReport(q, correlationId);
    } else {
      assertOrigin(request);
      if (request.method !== "POST" || url.search || request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") throw new AccessError("VALIDATION_FAILED", 400);
      const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
      if (reader) try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); throw new AccessError("VALIDATION_FAILED", 400); } chunks.push(value); } } finally { reader.releaseLock(); }
      let q; try { q = JSON.parse(await new Blob(chunks as BlobPart[]).text()); } catch { throw new AccessError("VALIDATION_FAILED", 400); }
      result = await executeReport(q, correlationId, request.headers.get("x-workspace-reference"));
      if (q.type === "EXPORT") return new Response(reportCsv(reportSummary.parse(result.data)), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="elifora-report.csv"', "X-Content-Type-Options": "nosniff" } });
    }
    return Response.json(result, { headers });
  } catch (e) {
    const err = e instanceof AccessError ? e : new AccessError("NETWORK_ERROR", 503);
    return Response.json({ code: err.code, message: err.code, correlationId }, { status: err.status, headers });
  }
}
