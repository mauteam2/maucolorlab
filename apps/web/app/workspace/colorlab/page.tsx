import { ColorWorkspace } from "@/components/color-workspace";
import { verifiedClientContext } from "@/lib/clients/service";
export default async function ColorLabPage() {
 await verifiedClientContext();
 return <ColorWorkspace />;
}
