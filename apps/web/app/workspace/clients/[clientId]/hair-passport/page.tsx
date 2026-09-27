import { notFound } from "next/navigation";
import { z } from "zod";
import { HairPassportWorkspace } from "@/components/hair-passport-workspace";
export default async function HairPassportPage({ params }: { params: Promise<{ clientId: string }> }) {
 const { clientId } = await params;
 if (!z.uuid().safeParse(clientId).success) notFound();
 // The parent server layout authenticates access. Protected data is loaded fresh
 // through existing server APIs after mount, never embedded in the router cache.
 return <HairPassportWorkspace key={clientId} clientId={clientId.toLowerCase()} />;
}
