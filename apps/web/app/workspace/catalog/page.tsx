import { ColorRegistryLibrary } from "@/components/color-registry";
import { verifiedClientContext } from "@/lib/clients/service";
export default async function CatalogPage() {
 await verifiedClientContext("color_plan.read");
 return <ColorRegistryLibrary/>;
}
