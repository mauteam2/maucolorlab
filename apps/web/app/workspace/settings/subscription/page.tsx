import { verifiedPageContext as verifiedClientContext } from "@/lib/auth-entry/server";
import { SaasWorkspace } from "@/components/saas-workspace";
export default async function SubscriptionPage() { await verifiedClientContext("saas.entitlements.read"); return <SaasWorkspace />; }
