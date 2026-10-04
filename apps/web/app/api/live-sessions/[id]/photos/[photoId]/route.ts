import { liveResponse } from "@/lib/live/http";
type Context={params:Promise<{id:string;photoId:string}>};
async function handle(request:Request,c:Context){const p=await c.params;return liveResponse(request,p.id,p.photoId);}
export const GET=handle;
export const POST=handle;
