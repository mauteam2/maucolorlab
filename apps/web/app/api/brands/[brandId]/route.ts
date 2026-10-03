import { brandResponse } from "@/lib/brand/http";
export async function GET(request:Request,context:{params:Promise<Record<string,string>>}) { return brandResponse(request,"brand",context.params); }
