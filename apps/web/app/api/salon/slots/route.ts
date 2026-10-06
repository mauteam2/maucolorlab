import { salonResponse } from "@/lib/salon/http";
export const POST = (request: Request) => salonResponse(request, "slots");
