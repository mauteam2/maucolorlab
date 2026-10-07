import { crmResponse } from "@/lib/crm/http";
export const POST=(request:Request)=>crmResponse(request,"read");
