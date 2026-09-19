import { hairMutationResponse } from "@/lib/hair-passport/mutation-http";
import { addHairPhysicalTest } from "@/lib/hair-passport/physical-test-service";

export async function POST(request: Request, { params }: { params: Promise<{ clientId: string }> }) {
 return hairMutationResponse(request, params, "add_physical_test", addHairPhysicalTest);
}
