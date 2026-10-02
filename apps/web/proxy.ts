import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnvironment } from "@/lib/env/public";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnvironment();
  const client = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values, headers) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (request.nextUrl.pathname === "/sign-in" && user && !error) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/workspaces";
    destination.search = "";
    const redirect = NextResponse.redirect(destination);
    // Preserve cookies refreshed by the existing verified-session flow.
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: ["/sign-in", "/workspaces", "/workspace/:path*", "/api/session", "/api/clients"] };
