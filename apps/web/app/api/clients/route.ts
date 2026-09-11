import { AccessError } from "@/lib/tenant/bootstrap";
import { clientCommand, errorStatus } from "@/lib/clients/contracts";
import { executeClientCommand } from "@/lib/clients/service";

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  const headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
  try {
    // Browser cookies must only authorize requests from this application's origin.
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host")) throw new AccessError("FORBIDDEN", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccessError("VALIDATION_FAILED", 400);
    const raw = await request.text();
    if (raw.length > 8192) throw new AccessError("VALIDATION_FAILED", 400);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new AccessError("VALIDATION_FAILED", 400); }
    const parsed = clientCommand.safeParse(body);
    if (!parsed.success) throw new AccessError("VALIDATION_FAILED", 400);
    const result = await executeClientCommand(parsed.data, correlationId, request.headers.get("x-workspace-reference"));
    return Response.json(result, { headers, status: result.code ? errorStatus(result.code) : 200 });
  } catch (error) {
    const known = error instanceof AccessError ? error : new AccessError("NETWORK_ERROR", 503);
    return Response.json({ code: known.code, message: known.code, correlationId }, { status: known.status, headers });
  }
}
