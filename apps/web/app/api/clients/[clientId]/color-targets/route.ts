import { colorResponse } from "@/lib/color/http";
export async function POST(request:Request,{params}:{params:Promise<{clientId:string}>}) {return colorResponse(request,params,"create_target");}
export async function PATCH(request:Request,{params}:{params:Promise<{clientId:string}>}) {return colorResponse(request,params,"revise_target");}
