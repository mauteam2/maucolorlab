import Link from "next/link";
import { notFound } from "next/navigation";
import { SalonFrame, SalonHeading, SalonCard } from "@/components/salon-frame";
export default function SalonGallery() {
 if(process.env.NODE_ENV!=="development") notFound();
 return <SalonFrame active="dashboard" preview><main className="salon-main" id="main-content"><SalonHeading title="ELIFORA tasarım önizlemesi" description="Onaylı dokuz ekranın etkileşimli önizlemeleri. Örnek veriler gerçek kayıt oluşturmaz."/><div className="salon-stats three">{[["dashboard","Ana panel"],["clients","Müşteriler"],["profile","Müşteri profili / Hair Passport"],["appointments","Randevular"],["finance","Finans"],["reports","Raporlar"],["team","Ekip"],["settings","Salon ayarları"],["colorlab","ColorLab"]].map(([path,label])=><SalonCard title={label} key={path}><Link className="button button-secondary" href={`/preview/salon/${path}`}>Ekranı aç →</Link></SalonCard>)}</div></main></SalonFrame>;
}
