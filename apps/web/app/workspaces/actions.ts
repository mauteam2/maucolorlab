"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { resolveSelection, selectionCookie, workspaceReference } from "@/lib/tenant/context";
export async function selectWorkspace(form: FormData) {
  const contexts = await bootstrap().catch((error: unknown) => {
    if (error instanceof AccessError && error.status === 401) redirect("/sign-in?reason=" + error.code);
    throw error;
  });
  const selected = resolveSelection(contexts, String(form.get("reference") ?? "invalid"));
  if (!selected) {
    (await cookies()).delete(selectionCookie);
    redirect("/workspaces?reason=TENANT_CONTEXT_INVALID");
  }
  (await cookies()).set(selectionCookie, workspaceReference(selected), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/workspace");
}
export async function changeWorkspace() {
  (await cookies()).delete(selectionCookie);
  redirect("/workspaces?choose=1");
}
