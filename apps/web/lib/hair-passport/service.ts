import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
import { createClient } from "@/lib/supabase/server";
import { hairReadRequest, hairReadResult, hairReadErrorStatus, type HairReadOptions } from "./contracts";

export async function readHairPassport(clientId: string, options: HairReadOptions, correlationId: string) {
 const request = hairReadRequest.safeParse({ client_id: clientId, options });
 if (!request.success) throw new AccessError("VALIDATION_FAILED", 400);
 const context = await verifiedClientContext("hair_passport.read");
 const client = await createClient();
 const { data, error, status } = await client.rpc("hair_passport_snapshot", {
  p_membership_id: context.membership_id, p_location_id: context.location_id,
  p_client_id: request.data.client_id, p_options: request.data.options, p_correlation_id: correlationId,
 });
 if (error) throw new AccessError(status === 401 ? "SESSION_EXPIRED" : status === 403 ? "FORBIDDEN" : "NETWORK_ERROR",
  status === 401 ? 401 : status === 403 ? 403 : 503);
 const parsed = hairReadResult.safeParse(data);
 if (!parsed.success || parsed.data.correlationId !== correlationId) throw new AccessError("NETWORK_ERROR", 503);
 if ("code" in parsed.data) throw new AccessError(parsed.data.code, hairReadErrorStatus(parsed.data.code));
 const snapshot = parsed.data.data;
 if (snapshot.passport.client_id !== clientId ||
  (!request.data.options.include_archived && (snapshot.passport.client_status === "ARCHIVED" || snapshot.passport.status === "ARCHIVED")) ||
  snapshot.physical_tests.offset !== request.data.options.tests_offset ||
  snapshot.history.offset !== request.data.options.history_offset ||
  snapshot.physical_tests.page_size !== request.data.options.page_size ||
  snapshot.history.page_size !== request.data.options.page_size)
  throw new AccessError("NETWORK_ERROR", 503);
 return parsed.data;
}
