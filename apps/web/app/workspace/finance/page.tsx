import { verifiedClientContext } from "@/lib/clients/service";
import { FinanceWorkspace } from "@/components/finance-workspace";
export default async function FinancePage(){await verifiedClientContext("finance.view");return <FinanceWorkspace/>;}
