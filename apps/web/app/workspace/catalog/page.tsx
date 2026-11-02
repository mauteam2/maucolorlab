import { ColorRegistryLibrary } from "@/components/color-registry";
import { verifiedPageContext as verifiedClientContext } from "@/lib/auth-entry/server";
export default async function CatalogPage() {
 await verifiedClientContext("color_plan.read");
 return <ColorRegistryLibrary/>;
}
