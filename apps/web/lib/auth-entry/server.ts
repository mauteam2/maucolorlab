import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccessError, bootstrap } from "@/lib/tenant/bootstrap";
import { resolveSelection, selectionCookie } from "@/lib/tenant/context";
import { verifiedClientContext } from "@/lib/clients/service";
import { readMyInvitations } from "@/lib/membership-invitations/service";
import { accessMessages } from "./presentation";

export function pageEntryError(error: unknown): never {
  if (!(error instanceof AccessError)) throw error;
  if (error.status === 401) redirect("/sign-in?reason=" + (error.code === "UNAUTHENTICATED" ? "UNAUTHENTICATED" : "SESSION_EXPIRED"));
  if (Object.hasOwn(accessMessages, error.code)) redirect("/auth/access?reason=" + error.code);
  throw error;
}
// Presentation-only wrapper for page guards. API and domain guards retain their
// existing HTTP errors; no redirect or permission change enters those services.
export async function verifiedPageContext(permission = "clients.read") {
  try { return await verifiedClientContext(permission); } catch (error) { return pageEntryError(error); }
}
export async function entryDestination() {
  const contexts = await bootstrap();
  const reference = (await cookies()).get(selectionCookie)?.value;
  if (reference && !resolveSelection(contexts, reference)) return "/auth/workspace-reset";
  if (resolveSelection(contexts, reference)) return "/workspace";
  if (contexts.length) return "/workspaces";
  const pending = await readMyInvitations();
  return pending.data.length ? "/invitations" : "/workspaces";
}
