import { ClientWorkspace } from "@/components/client-workspace";
import { verifiedClientContext } from "@/lib/clients/service";
export default async function NewClientPage() {
  await verifiedClientContext("clients.create");
  return <ClientWorkspace key="new" route="new" />;
}
