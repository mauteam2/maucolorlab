import { NextRequest, NextResponse } from "next/server";
import { selectionCookie } from "@/lib/tenant/context";
// A preference reset never grants access. The destination revalidates the session and memberships.
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/workspaces?reason=TENANT_CONTEXT_INVALID", request.url));
  response.cookies.delete(selectionCookie);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
