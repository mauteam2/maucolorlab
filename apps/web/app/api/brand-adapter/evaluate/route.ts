import { brandResponse } from "@/lib/brand/http";
export async function POST(request:Request,context:{params:Promise<Record<string,string>>}) { return brandResponse(request,"evaluate",context.params); }
