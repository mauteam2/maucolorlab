import { SalonOperations } from "@/components/salon-operations";
import { verifiedPageContext as verifiedClientContext } from "@/lib/auth-entry/server";
export default async function SettingsPage() {await verifiedClientContext("salon.read");return <SalonOperations section="settings"/>;}
