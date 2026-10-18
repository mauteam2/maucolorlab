import { readAppointmentReadiness } from "@/lib/salon/service";
import { AccessError } from "@/lib/tenant/bootstrap";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try {
  if(new URL(request.url).search)throw new AccessError("VALIDATION_FAILED",400);
  return Response.json(await readAppointmentReadiness((await params).id,correlationId),{headers});
 }catch(e){const error=e instanceof AccessError?e:new AccessError("NETWORK_ERROR",503);return Response.json({code:error.code,message:error.code,correlationId},{status:error.status,headers});}
}
