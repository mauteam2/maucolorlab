import { ClientWorkspace } from "@/components/client-workspace";
import { verifiedPageContext as verifiedClientContext } from "@/lib/auth-entry/server";
export default async function ClientsPage() {
  await verifiedClientContext();
  return <ClientWorkspace key="directory" route="directory" />;
}
