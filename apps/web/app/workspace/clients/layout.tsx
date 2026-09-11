import { redirect } from "next/navigation";
import { AccessError } from "@/lib/tenant/bootstrap";
import { verifiedClientContext } from "@/lib/clients/service";
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await verifiedClientContext().catch((error: unknown) => {
    if (error instanceof AccessError && error.status === 401) redirect("/sign-in?reason=" + error.code);
    if (error instanceof AccessError && error.status === 403) redirect("/auth/workspace-reset");
    throw error;
  });
  return children;
}
