import { ClientWorkspace } from "@/components/client-workspace";
import { verifiedPageContext as verifiedClientContext } from "@/lib/auth-entry/server";
import { notFound } from "next/navigation";
import { z } from "zod";
export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  await verifiedClientContext();
  const { clientId } = await params;
  if (!z.uuid().safeParse(clientId).success) notFound();
  return <ClientWorkspace key={clientId} route={clientId} />;
}
