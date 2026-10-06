import { SalonOperations } from "@/components/salon-operations";
import { verifiedClientContext } from "@/lib/clients/service";
export default async function SettingsPage() {await verifiedClientContext("salon.read");return <SalonOperations section="settings"/>;}
