import { salonResponse } from "@/lib/salon/http";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return salonResponse(request,"detail",(await params).id);}
