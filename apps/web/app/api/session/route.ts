import { cookies } from "next/headers";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { resolveSelection, selectionCookie, selectionError, workspaceReference } from "@/lib/tenant/context";
export async function GET() {
  const correlationId = crypto.randomUUID();
  const headers = { "Cache-Control": "private, no-store", "X-Correlation-ID": correlationId };
  try {
    const contexts = await bootstrap();
    const jar = await cookies();
    const reference = jar.get(selectionCookie)?.value;
    const selected = resolveSelection(contexts, reference);
    if (!selected) {
      jar.delete(selectionCookie);
      throw new AccessError(selectionError(contexts, reference), 403);
    }
    if (!reference) jar.set(selectionCookie, workspaceReference(selected), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31536000,
    });
    return Response.json({ context: selected, correlationId }, { headers });
  } catch (error) {
    const known = error instanceof AccessError ? error : new AccessError("NETWORK_ERROR", 503);
    return Response.json({ code: known.code, message: known.code, correlationId }, { status: known.status, headers });
  }
}
