import { controlledResponse } from "@/lib/brand/controlled-http";
export const GET=async(request:Request,{params}:{params:Promise<{recipeId:string}>})=>controlledResponse(request,"read",(await params).recipeId);
