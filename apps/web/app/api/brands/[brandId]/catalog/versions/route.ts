import { governanceResponse } from "@/lib/brand/governance-http";
export async function GET(request:Request,{params}:{params:Promise<{brandId:string}>}){return governanceResponse(request,"versions",(await params).brandId);}
