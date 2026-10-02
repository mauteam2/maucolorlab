import { colorResponse } from "@/lib/color/http";
export async function GET(request:Request,{params}:{params:Promise<{clientId:string;targetId:string}>}) {return colorResponse(request,params,"read_target");}
