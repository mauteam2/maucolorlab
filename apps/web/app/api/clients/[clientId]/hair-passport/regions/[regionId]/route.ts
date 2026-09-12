import { hairMutationResponse } from "@/lib/hair-passport/mutation-http";

export function PATCH(request: Request, { params }: { params: Promise<{ clientId: string; regionId: string }> }) {
 return hairMutationResponse(request, params, "update_region");
}
