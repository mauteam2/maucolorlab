import { governanceResponse } from "@/lib/brand/governance-http";
export async function GET(request:Request,{params}:{params:Promise<{sourceId:string}>}){return governanceResponse(request,"source",(await params).sourceId);}
