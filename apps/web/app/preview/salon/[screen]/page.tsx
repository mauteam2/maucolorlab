import { notFound } from "next/navigation";
import { SalonPreview } from "@/components/salon-preview";
import { requireDevelopmentPreview } from "@/lib/env/preview";
export default async function SalonPreviewPage({ params }: { params: Promise<{ screen: string }> }) {
 await requireDevelopmentPreview();
 const { screen } = await params;
 if (!["dashboard","colorlab","clients","profile","appointments","finance","reports","team","settings"].includes(screen)) notFound();
 return <SalonPreview screen={screen as Parameters<typeof SalonPreview>[0]["screen"]} />;
}
