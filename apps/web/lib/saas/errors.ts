import "server-only";
import { AccessError } from "@/lib/tenant/bootstrap";
import { saasErrorCodes } from "./model";
export function throwSaasError(error: unknown) {
  const message = typeof error === "object" && error !== null && "message" in error ? error.message : null;
  const code = saasErrorCodes.find(c => message === c);
  if (code) throw new AccessError(code, 409);
}
