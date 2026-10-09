import { verifiedClientContext } from "@/lib/clients/service";
import { StockWorkspace } from "@/components/stock-workspace";
export default async function StockPage(){await verifiedClientContext("stock.view");return <StockWorkspace/>;}
