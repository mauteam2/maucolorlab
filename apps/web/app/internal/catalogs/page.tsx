import Link from "next/link";
import { redirect } from "next/navigation";
import { SalonFrame } from "@/components/salon-frame";
import { CatalogGovernanceControls } from "@/components/catalog-governance-controls";
import { listInternalCatalogs } from "@/lib/brand/governance-service";
import { AccessError } from "@/lib/tenant/bootstrap";
export default async function CatalogsPage(){
 const catalogs=await listInternalCatalogs().catch((e:unknown)=>{if(e instanceof AccessError&&e.status===401)redirect("/sign-in");if(e instanceof AccessError&&e.status===403)return null;throw e;});
 return <SalonFrame active="settings"><main className="salon-main salon-stack" id="main-content"><h1>Teknik katalog yönetimi</h1>{catalogs===null?<section className="salon-card"><p role="alert">Bu alan yalnızca yetkili katalog operatörlerine açıktır.</p></section>:<><p className="lead">IGORA ROYAL ABSOLUTES — kaynaklar, sürümler ve yayın süreci.</p><section className="salon-card"><h2>Katalog sürümleri</h2>{!catalogs.length?<p>Henüz pilot katalog taslağı oluşturulmadı.</p>:<div className="salon-table-scroll"><table className="salon-table"><thead><tr><th>Sürüm</th><th>İnceleme durumu</th><th>Katalog</th></tr></thead><tbody>{catalogs.map(c=><tr key={c.id}><td>{c.version}</td><td>{c.state}</td><td><Link href={`/internal/catalogs/${c.id}`}>İncele</Link></td></tr>)}</tbody></table></div>}</section>{(!catalogs.length||["PUBLISHED","RETIRED","REJECTED"].includes(catalogs[0]!.state))&&<CatalogGovernanceControls previousId={catalogs[0]?.id}/>}<p>Sayısal pigment verileri UNKNOWN. Yayınlanmış ürün adayları kimyasal uygulama izni değildir.</p></>}</main></SalonFrame>;
}
