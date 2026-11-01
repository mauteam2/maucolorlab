import { invitationResponse } from "@/lib/membership-invitations/http";
export async function GET(request: Request) { return invitationResponse(request); }
