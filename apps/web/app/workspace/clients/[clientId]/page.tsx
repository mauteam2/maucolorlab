import { ClientWorkspace } from "@/components/client-workspace";
import { verifiedClientContext } from "@/lib/clients/service";
import { notFound } from "next/navigation";
import { z } from "zod";
export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  await verifiedClientContext();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();
  return <ClientWorkspace key={clientId} route={clientId} />;
}
