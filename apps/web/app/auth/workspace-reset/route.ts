import { NextResponse } from "next/server";
import { selectionCookie } from "@/lib/tenant/context";
// A preference reset never grants access. The destination revalidates the session and memberships.
export function GET() {
  // A relative Location preserves the browser's origin even behind a proxy/dev host rewrite.
  const response = new NextResponse(null, { status: 303, headers: { Location: "/workspaces?reason=TENANT_CONTEXT_INVALID" } });
  response.cookies.delete(selectionCookie);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
