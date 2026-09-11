import { ClientWorkspace } from "@/components/client-workspace";
import { verifiedClientContext } from "@/lib/clients/service";
export default async function ClientsPage() {
  await verifiedClientContext();
  return <ClientWorkspace key="directory" route="directory" />;
}
