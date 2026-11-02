import { PilotReadiness } from "@/components/pilot-readiness";
import { verifiedPageContext as verifiedClientContext, pageEntryError } from "@/lib/auth-entry/server";
import { AccessError } from "@/lib/tenant/bootstrap";
export default async function PilotPage(){const context=await verifiedClientContext("salon.read");if(context.role!=="owner")return pageEntryError(new AccessError("FORBIDDEN",403));return <PilotReadiness/>;}
