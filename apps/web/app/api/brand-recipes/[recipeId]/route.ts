import { readBrandRecipe } from "@/lib/brand/service";
import { AccessError } from "@/lib/tenant/bootstrap";
export async function GET(request:Request,context:{params:Promise<{recipeId:string}>}){
 const correlationId=crypto.randomUUID(),headers={"Cache-Control":"private, no-store","X-Correlation-ID":correlationId};
 try{if(new URL(request.url).search)throw new AccessError("VALIDATION_FAILED",400);return Response.json(await readBrandRecipe((await context.params).recipeId,correlationId),{headers});}
 catch(error){const known=error instanceof AccessError?error:new AccessError("NETWORK_ERROR",503);return Response.json({code:known.code,message:known.code,correlationId},{headers,status:known.status});}
}
