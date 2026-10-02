import { colorResponse } from "@/lib/color/http";
export async function POST(request:Request,{params}:{params:Promise<{clientId:string}>}) {return colorResponse(request,params,"generate_plan");}
