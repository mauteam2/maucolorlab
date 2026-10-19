import { PilotReadiness } from "@/components/pilot-readiness";
import { verifiedClientContext } from "@/lib/clients/service";
import { AccessError } from "@/lib/tenant/bootstrap";
export default async function PilotPage(){const context=await verifiedClientContext("salon.read");if(context.role!=="owner")throw new AccessError("FORBIDDEN",403);return <PilotReadiness/>;}
