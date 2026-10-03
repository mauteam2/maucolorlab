import { governanceResponse } from "@/lib/brand/governance-http";
export function POST(request:Request){return governanceResponse(request,"pilot");}
