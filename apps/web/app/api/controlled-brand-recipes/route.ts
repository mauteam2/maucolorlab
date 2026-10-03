import { controlledResponse } from "@/lib/brand/controlled-http";
export const POST=(request:Request)=>controlledResponse(request,"create");
export const GET=(request:Request)=>controlledResponse(request,"read");
