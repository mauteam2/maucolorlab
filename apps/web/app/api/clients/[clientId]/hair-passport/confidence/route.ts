import { AccessError } from "@/lib/tenant/bootstrap";
import { confidenceOptions } from "@/lib/confidence/contracts";
import { readCaseConfidence } from "@/lib/confidence/service";

export async function GET(request: Request, {params}: {params: Promise<{clientId: string}>}) {
 const correlationId = crypto.randomUUID();
 const headers = {"Cache-Control": "private, no-store", "X-Correlation-ID": correlationId};
 try {
  const query = new URL(request.url).searchParams;
  const options: Record<string, unknown> = {};
  for (const [key, value] of query) {
   if (key !== "include_archived" || key in options || !["true", "false"].includes(value)) throw new AccessError("VALIDATION_FAILED", 400);
   options[key] = value === "true";
  }
  const parsed = confidenceOptions.safeParse(options);
  if (!parsed.success) throw new AccessError("VALIDATION_FAILED", 400);
  return Response.json(await readCaseConfidence((await params).clientId, parsed.data, correlationId), {headers});
 } catch (error) {
  const known = error instanceof AccessError ? error : new AccessError("NETWORK_ERROR", 503);
  return Response.json({code: known.code, message: known.code, correlationId}, {headers, status: known.status});
 }
}
