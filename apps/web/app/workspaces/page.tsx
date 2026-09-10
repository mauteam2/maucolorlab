import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { resolveSelection, selectionCookie, workspaceReference } from "@/lib/tenant/context";
import { tr } from "@/lib/i18n/tr";
import { logout } from "@/app/sign-in/actions";
import { selectWorkspace } from "./actions";
export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ choose?: string; reason?: string }> }) {
  const query = await searchParams;
  const contexts = await bootstrap().catch((error: unknown) => {
    if (error instanceof AccessError && error.status === 401) redirect("/sign-in?reason=" + error.code);
    throw error;
  });
  const reference = (await cookies()).get(selectionCookie)?.value;
  if (!query.choose && !query.reason && resolveSelection(contexts, reference)) redirect("/workspace");
  return <AppShell><main className="narrow-page" id="main-content">
    <h1>{contexts.length ? tr.select : tr.noMembership}</h1>
    {!contexts.length && <p className="lead">{tr.noMembershipDetail}</p>}
    {query.reason && <p role="alert">{tr.invalidContext}</p>}
    <div className="workspace-options">{contexts.map((context) => <form action={selectWorkspace} key={workspaceReference(context)}>
      <input type="hidden" name="reference" value={workspaceReference(context)} />
      <button className="workspace-option"><strong>{context.organization_name}</strong>
        <span>{context.location_name}</span><span>{tr.roles[context.role]}</span></button>
    </form>)}</div>
    <a className="text-link" href="/workspaces?choose=1">{tr.retry}</a>
    <form action={logout}><button className="button button-secondary">{tr.logout}</button></form>
  </main></AppShell>;
}
