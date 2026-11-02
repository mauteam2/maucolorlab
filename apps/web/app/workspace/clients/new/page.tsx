import { ClientWorkspace } from "@/components/client-workspace";
import { verifiedPageContext as verifiedClientContext } from "@/lib/auth-entry/server";
export default async function NewClientPage() {
  await verifiedClientContext("clients.create");
  return <ClientWorkspace key="new" route="new" />;
}
