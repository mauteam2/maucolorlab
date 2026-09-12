import { hairMutationResponse } from "@/lib/hair-passport/mutation-http";

export function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
 return hairMutationResponse(request, params, "create_region");
}
