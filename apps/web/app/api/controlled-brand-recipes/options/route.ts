import { controlledResponse } from "@/lib/brand/controlled-http";
export const POST=(request:Request)=>controlledResponse(request,"options");
