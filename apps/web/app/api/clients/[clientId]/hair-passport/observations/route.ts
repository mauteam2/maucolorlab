import { hairMutationResponse } from "@/lib/hair-passport/mutation-http";
import { addHairObservation } from "@/lib/hair-passport/observation-service";

export function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
 return hairMutationResponse(request, params, "add_observation", addHairObservation);
}
