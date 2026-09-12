import { AccessError } from "@/lib/tenant/bootstrap";
import { readHairPassport } from "@/lib/hair-passport/service";
import { hairReadOptions } from "@/lib/hair-passport/contracts";

export async function GET(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
 const correlationId = crypto.randomUUID();
 const headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
 try {
  const query = new URL(request.url).searchParams;
  const options: Record<string, unknown> = {};
  for (const [key, value] of query) {
   if (key in options) throw new AccessError("VALIDATION_FAILED", 400);
   if (key === "include_archived") {
    if (value !== "true" && value !== "false") throw new AccessError("VALIDATION_FAILED", 400);
    options[key] = value === "true";
   } else {
    if (!/^[0-9]{1,5}$/.test(value)) throw new AccessError("VALIDATION_FAILED", 400);
    options[key] = Number(value);
   }
  }
  const parsed = hairReadOptions.safeParse(options);
  if (!parsed.success) throw new AccessError("VALIDATION_FAILED", 400);
  const result = await readHairPassport((await params).clientId, parsed.data, correlationId);
  return Response.json(result, { headers });
 } catch (error) {
  const known = error instanceof AccessError ? error : new AccessError("NETWORK_ERROR", 503);
  return Response.json({ code: known.code, message: known.code, correlationId }, { headers, status: known.status });
 }
}
