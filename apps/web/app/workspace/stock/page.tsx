import { verifiedPageContext as verifiedClientContext } from "@/lib/auth-entry/server";
import { StockWorkspace } from "@/components/stock-workspace";
export default async function StockPage(){await verifiedClientContext("stock.view");return <StockWorkspace/>;}
