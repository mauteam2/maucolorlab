import { notFound } from "next/navigation";
import { SalonPreview } from "@/components/salon-preview";
export default async function SalonPreviewPage({ params }: { params: Promise<{ screen: string }> }) {
 if (process.env.NODE_ENV !== "development") notFound();
 const { screen } = await params;
 if (!["dashboard","colorlab","clients","profile","appointments","finance","reports","team","settings"].includes(screen)) notFound();
 return <SalonPreview screen={screen as Parameters<typeof SalonPreview>[0]["screen"]} />;
}
