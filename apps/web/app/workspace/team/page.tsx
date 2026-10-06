import { SalonOperations } from "@/components/salon-operations";
import { verifiedClientContext } from "@/lib/clients/service";
export default async function TeamPage() {await verifiedClientContext("salon.read");return <SalonOperations section="team"/>;}
