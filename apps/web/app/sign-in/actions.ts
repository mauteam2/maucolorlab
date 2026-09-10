"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { selectionCookie } from "@/lib/tenant/context";
export async function signIn(_state: { code: string }, form: FormData): Promise<{ code: string; correlationId?: string }> {
  const correlationId = crypto.randomUUID();
  const input = z.object({ email: z.email(), password: z.string().min(1).max(1024) }).safeParse({
    email: String(form.get("email") ?? "").trim(), password: form.get("password"),
  });
  if (!input.success) return { code: "INVALID_CREDENTIALS", correlationId };
  try {
    const client = await createClient();
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) return { code: error.status === 400 || error.status === 422 ? "INVALID_CREDENTIALS" : "NETWORK_ERROR", correlationId };
  } catch { return { code: "NETWORK_ERROR", correlationId }; }
  (await cookies()).delete(selectionCookie);
  redirect("/workspaces");
}
export async function logout() {
  const client = await createClient();
  try { await client.auth.signOut({ scope: "local" }); } catch { /* Local access still ends offline. */ }
  const jar = await cookies();
  jar.getAll().filter(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"))
    .forEach(({ name }) => jar.delete(name));
  jar.delete(selectionCookie);
  redirect("/sign-in");
}
