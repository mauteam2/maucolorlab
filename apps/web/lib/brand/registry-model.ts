import { z } from "zod";

export const discoveryStates = ["DISCOVERED", "SOURCE_COLLECTED", "UNDER_REVIEW", "VERIFIED", "PUBLISHED", "REJECTED", "SUPERSEDED"] as const;
export const unsupportedRegistryMessage = "Bu seri ELIFORA kataloğunda yer alıyor ancak doğrulanmış teknik reçete desteği henüz yayınlanmadı.";
export const discoveryLabels: Record<typeof discoveryStates[number], string> = {
 DISCOVERED: "Marka / seri listelendi", SOURCE_COLLECTED: "Kaynaklar toplandı", UNDER_REVIEW: "Teknik incelemede",
 VERIFIED: "Veri incelemesi tamamlandı", PUBLISHED: "Kontrollü reçete desteği yayınlandı", REJECTED: "Reddedildi", SUPERSEDED: "Yerine yeni kayıt / emekli",
};
const region = z.string().regex(/^(UNKNOWN|GLOBAL|EU|[A-Z]{2})$/);
const key = z.string().regex(/^[a-z0-9-]{1,100}$/);
export const registryQuery = z.strictObject({
 query: z.string().trim().max(80).default(""), brand: key.optional(), region: region.optional(), state: z.enum(discoveryStates).optional(),
 offset: z.coerce.number().int().min(0).max(10000).default(0), limit: z.coerce.number().int().min(1).max(50).default(25),
});
export const registrySource = z.strictObject({
 id: key, url: z.url().startsWith("https://"), title: z.string(), documentType: z.string(), region,
 language: z.string(), documentVersion: z.string().nullable(), documentDate: z.string().nullable(),
 retrievedAt: z.iso.datetime({ offset: true }), sha256: z.string().regex(/^[a-f0-9]{64}$/),
 reviewStatus: z.enum(["SOURCE_COLLECTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUPERSEDED"]),
});
export const registryEntry = z.strictObject({
 id: z.uuid(), lineId: key, line: z.string(), brandId: key, brand: z.string(), manufacturer: z.string(), region,
 state: z.enum(discoveryStates), lastReviewedAt: z.iso.datetime({ offset: true }).nullable(),
 recipeSupport: z.boolean(), catalogId: z.uuid().nullable(), shadeCount: z.number().int().nonnegative(),
 developerCount: z.number().int().nonnegative(), ruleCount: z.number().int().nonnegative(), sources: z.array(registrySource),
}).superRefine((value, ctx) => {
 if (value.recipeSupport && (value.state !== "PUBLISHED" || !value.catalogId || value.region === "UNKNOWN" || !value.ruleCount))
  ctx.addIssue({ code: "custom", message: "Governed published support required" });
 if (!value.recipeSupport && (value.catalogId !== null || value.ruleCount !== 0))
  ctx.addIssue({ code: "custom", message: "Discovery cannot expose executable rules" });
 if (value.sources.some(source => source.region !== value.region)) ctx.addIssue({ code: "custom", message: "Explicit regional evidence required" });
});
export const registryPage = z.strictObject({
 schemaVersion: z.literal(1), total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), limit: z.number().int().min(1).max(50),
 brands: z.array(z.strictObject({ id: key, name: z.string() })), regions: z.array(region), items: z.array(registryEntry).max(50),
});
export type RegistryPage = z.infer<typeof registryPage>;
export type RegistryEntry = z.infer<typeof registryEntry>;
