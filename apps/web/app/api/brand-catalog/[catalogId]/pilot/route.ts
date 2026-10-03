import { governanceResponse } from "@/lib/brand/governance-http";
export async function GET(request:Request,{params}:{params:Promise<{catalogId:string}>}){return governanceResponse(request,"packet",(await params).catalogId);}
