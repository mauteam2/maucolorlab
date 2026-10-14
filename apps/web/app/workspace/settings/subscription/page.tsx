import { verifiedClientContext } from "@/lib/clients/service";
import { SaasWorkspace } from "@/components/saas-workspace";
export default async function SubscriptionPage() { await verifiedClientContext("saas.entitlements.read"); return <SaasWorkspace />; }
