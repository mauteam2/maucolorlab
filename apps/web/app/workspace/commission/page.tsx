import {verifiedClientContext} from "@/lib/clients/service";
import {CostingWorkspace} from "@/components/costing-workspace";
export default async function CommissionPage(){await verifiedClientContext("commission.view_self");return <CostingWorkspace initialKind="COMMISSION_SELF"/>;}
