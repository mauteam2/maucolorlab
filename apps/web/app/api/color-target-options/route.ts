import { verifiedClientContext } from "@/lib/clients/service";
import { AccessError } from "@/lib/tenant/bootstrap";
import { options } from "@/lib/color/taxonomy";
export async function GET(request:Request){
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try{
  if(new URL(request.url).search)throw new AccessError("VALIDATION_FAILED",400);
  const context=await verifiedClientContext("color_plan.read");
  if(!context.permissions.includes("hair_passport.read")||!context.permissions.includes("clients.read"))throw new AccessError("FORBIDDEN",403);
  // Static target intent metadata: no customer data, execution, entitlement consumption or chemistry.
  return Response.json({data:options,correlationId},{headers});
 }catch(error){const e=error instanceof AccessError?error:new AccessError("NETWORK_ERROR",503);return Response.json({code:e.code,message:e.code,correlationId},{status:e.status,headers});}
}
