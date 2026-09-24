import { hairMutationResponse } from "@/lib/hair-passport/mutation-http";
import { addHairHistory } from "@/lib/hair-passport/history-service";

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
 return hairMutationResponse(request, params, "add_history", addHairHistory);
}
