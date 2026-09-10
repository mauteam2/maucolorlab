import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { resolveSelection, selectionCookie } from "@/lib/tenant/context";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function WorkspacePage() {
  const contexts = await bootstrap().catch((error: unknown) => {
    if (error instanceof AccessError && error.status === 401) redirect("/sign-in?reason=" + error.code);
    throw error;
  });
  const reference = (await cookies()).get(selectionCookie)?.value;
  const selected = resolveSelection(contexts, reference);
  if (!selected) redirect(reference ? "/auth/workspace-reset" : "/workspaces");
  return <WorkspaceShell initial={selected} />;
}
