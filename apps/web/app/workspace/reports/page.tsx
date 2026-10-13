import { verifiedClientContext } from "@/lib/clients/service";
import { ReportingWorkspace } from "@/components/reporting-workspace";
import { reportRequest } from "@/lib/reporting/model";
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await verifiedClientContext("reports.read");
  const parsed = reportRequest.safeParse(await searchParams);
  return <ReportingWorkspace initialRequest={parsed.success ? parsed.data : {}} />;
}
