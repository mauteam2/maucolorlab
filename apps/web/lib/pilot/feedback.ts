import { z } from "zod";
export const feedbackCategories = ["ColorLab kullanımı","Color Engine yararı","Teknik terimler","Reçete yararı","Hair Passport","Live Session","Randevular","CRM","Stok","Finans","Performans","Hata","Özellik isteği"] as const;
export const reviewDimensions = ["Hedef seçiminin açıklığı","Hair Passport ilgisi","Risk değerlendirmesinin yararı","Uygulanabilirliğin yararı","Stratejinin yararı","Terminoloji","Reçete şeffaflığı","Güven","İş akışı hızı","Genel kullanım isteği"] as const;
export const feedbackInput=z.strictObject({category:z.enum(feedbackCategories),severity:z.enum(["P0","P1","P2","P3"]),comment:z.string().trim().max(2000),ratings:z.array(z.number().int().min(1).max(5).nullable()).length(10)});
export function feedbackDocument(input:unknown,release: {gitSha:string;colorEngineVersion:string;catalogs:unknown[];publishedCatalogs?:unknown[]}) {
 const parsed=feedbackInput.parse(input);
 return {schemaVersion:1,...parsed,release:{gitSha:release.gitSha,colorEngineVersion:release.colorEngineVersion,catalogs:release.catalogs,...(release.publishedCatalogs?{publishedCatalogs:release.publishedCatalogs}:{})},notice:"User-prepared feedback; no client payload automatically attached; no engine authority."};
}
