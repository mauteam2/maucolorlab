import { ColorWorkspace } from "@/components/color-workspace";
import { verifiedClientContext } from "@/lib/clients/service";
import { z } from "zod";
import { notFound } from "next/navigation";
export default async function ColorLabPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 await verifiedClientContext();
 const params=z.strictObject({client_id:z.uuid().transform(value=>value.toLowerCase()).optional()}).safeParse(await searchParams);
 if(!params.success)notFound();
 return <ColorWorkspace key={params.data.client_id??"directory"} initialClientId={params.data.client_id}/>;
}
