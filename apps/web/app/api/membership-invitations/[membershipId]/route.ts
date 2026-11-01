import { invitationResponse } from "@/lib/membership-invitations/http";
type Context = { params: Promise<{ membershipId: string }> };
export async function GET(request: Request, context: Context) { return invitationResponse(request, (await context.params).membershipId); }
export async function POST(request: Request, context: Context) { return invitationResponse(request, (await context.params).membershipId); }
