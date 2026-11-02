import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { bootstrap } from "@/lib/tenant/bootstrap";
import { pageIdentityError } from "@/lib/auth-entry/server";
import { resolveSelection, selectionCookie } from "@/lib/tenant/context";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function WorkspacePage() {
  const contexts = await bootstrap().catch(pageIdentityError);
  const reference = (await cookies()).get(selectionCookie)?.value;
  const selected = resolveSelection(contexts, reference);
  if (!selected) redirect(reference ? "/auth/workspace-reset" : "/workspaces");
  return <WorkspaceShell />;
}
