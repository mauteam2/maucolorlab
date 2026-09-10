import "server-only";
import { createClient } from "@/lib/supabase/server";
import { tenantContextSchema } from "./context";
export class AccessError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
export async function bootstrap() {
  const client = await createClient();
  const { data: user, error: authError } = await client.auth.getUser();
  if (authError || !user.user) {
    if (authError && (authError.status === 0 || (authError.status ?? 0) >= 500))
      throw new AccessError("NETWORK_ERROR", 503);
    throw new AccessError(authError?.name === "AuthSessionMissingError" ? "UNAUTHENTICATED" : "SESSION_EXPIRED", 401);
  }
  const { data, error, status } = await client.rpc("list_workspace_contexts");
  if (error) {
    if (status === 401) throw new AccessError("SESSION_EXPIRED", 401);
    if (status === 403 || error.code === "42501") throw new AccessError("FORBIDDEN", 403);
    throw new AccessError("NETWORK_ERROR", 503);
  }
  return tenantContextSchema.array().parse(data);
}
