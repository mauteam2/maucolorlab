import { governanceResponse } from "@/lib/brand/governance-http";
export async function POST(request:Request,{params}:{params:Promise<{catalogId:string}>}){return governanceResponse(request,"governance",(await params).catalogId);}
