import {verifiedClientContext} from "@/lib/clients/service";
import {CostingWorkspace} from "@/components/costing-workspace";
export default async function ProfitabilityPage({searchParams}:{searchParams:Promise<{charge_id?:string}>}){await verifiedClientContext("cost.view");const query=await searchParams;return <CostingWorkspace initialKind="PROFITABILITY" initialCharge={query.charge_id??""}/>;}
