import { liveResponse } from "@/lib/live/http";
type Context={params:Promise<{id:string}>};
export const GET=async(request:Request,c:Context)=>liveResponse(request,(await c.params).id);
export const POST=async(request:Request,c:Context)=>liveResponse(request,(await c.params).id);
