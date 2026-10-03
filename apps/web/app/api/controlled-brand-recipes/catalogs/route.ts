import { readControlledCatalogs } from "@/lib/brand/controlled-service";
import { AccessError } from "@/lib/tenant/bootstrap";
export async function GET(request:Request){
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try{if(new URL(request.url).search)throw new AccessError("VALIDATION_FAILED",400);return Response.json(await readControlledCatalogs(correlationId),{headers});}
 catch(error){const e=error instanceof AccessError?error:new AccessError("NETWORK_ERROR",503);return Response.json({code:e.code,message:e.code,correlationId},{status:e.status,headers});}
}
