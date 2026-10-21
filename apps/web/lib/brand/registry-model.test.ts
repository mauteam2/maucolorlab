import { expect, it } from "vitest";
import seed from "../../../../contracts/catalogs/global-discovery.json";
import { brandFixture, orgId } from "@/test/brand-fixtures";
import { evaluateBrandAdapter } from "./engine";
import { catalogPacket } from "./model";
import { discoveryStates, registryEntry, registryQuery } from "./registry-model";

export function entryFixture() {
 const entry = seed.tables.color_registry_entries[0]!;
 const line = seed.tables.color_registry_lines.find(line => line.id === entry.line_id)!;
 const brand = seed.tables.color_registry_brands.find(brand => brand.id === line.brand_id)!;
 return { id: entry.id, lineId: line.id, line: line.display_name, brandId: brand.id, brand: brand.display_name,
  manufacturer: "L’Oréal", region: entry.region, state: "SOURCE_COLLECTED" as const, lastReviewedAt: null,
  recipeSupport: false, catalogId: null, shadeCount: 0, developerCount: 0, ruleCount: 0, sources: [] };
}
it.each(discoveryStates.filter(state => state !== "PUBLISHED"))("%s discovery record cannot masquerade as engine catalog", state => {
 const row = registryEntry.parse({ ...entryFixture(), state });
 expect(row.recipeSupport).toBe(false);
 expect(catalogPacket.safeParse(row).success).toBe(false);
 expect(() => evaluateBrandAdapter(brandFixture().plan, row as never, orgId)).toThrow();
 expect(registryEntry.safeParse({ ...row, recipeSupport: true, catalogId: row.id, ruleCount: 58 }).success).toBe(false);
});
it("published label alone cannot grant recipe support", () => {
 expect(registryEntry.safeParse({ ...entryFixture(), state: "PUBLISHED", recipeSupport: true }).success).toBe(false);
 expect(registryEntry.safeParse({ ...entryFixture(), state: "PUBLISHED", region: "UNKNOWN", recipeSupport: true, catalogId: entryFixture().id, ruleCount: 58 }).success).toBe(false);
});
it("source regions cannot silently cross markets", () => {
 expect(registryEntry.safeParse({ ...entryFixture(), sources: [{ id: "source", url: "https://example.invalid/", title: "Synthetic", documentType: "PRODUCT_PAGE", region: "TR", language: "tr", documentVersion: null, documentDate: null, retrievedAt: new Date().toISOString(), sha256: "a".repeat(64), reviewStatus: "SOURCE_COLLECTED" }] }).success).toBe(false);
});
it("manufacturer labels and developer discovery cannot create vectors or compatibility", () => {
 expect(seed.tables.color_registry_metadata.filter(row => row.kind === "SHADE")).toHaveLength(7);
 expect(seed.tables.color_registry_metadata.filter(row => row.kind === "DEVELOPER")).toHaveLength(1);
 expect(seed.tables.color_registry_metadata.every(row => row.documented_level === null && row.documented_tone === null)).toBe(true);
 expect(seed.tables.color_registry_entries.every(row => row.state === "SOURCE_COLLECTED" && row.technical_line_id === null)).toBe(true);
 for (const key of ["pigmentVector", "mixingRatio", "compatibility", "executable"]) expect(registryEntry.safeParse({ ...entryFixture(), [key]: true }).success).toBe(false);
});
it("registry requests reject authority fields and unbounded enumeration", () => {
 for (const unsafe of [{ limit: 51 }, { offset: -1 }, { offset: 10001 }, { region: "ANY" }, { organization_id: entryFixture().id }, { executable: true }, { query: "a".repeat(81) }]) expect(registryQuery.safeParse(unsafe).success).toBe(false);
});
it("published technical rules still fail closed on missing compatibility and preserve retired history", () => {
 const f = brandFixture();
 const historical = evaluateBrandAdapter(f.plan, f.catalog, orgId);
 expect(historical.status).toBe("BRAND_READY");
 const absent = structuredClone(f.catalog); absent.compatibility = [];
 expect(evaluateBrandAdapter(f.plan, absent, orgId).recipe).toBeNull();
 const retired = structuredClone(f.catalog); retired.release.state = "RETIRED";
 expect(evaluateBrandAdapter(f.plan, retired, orgId).recipe).toBeNull();
 expect(historical.status).toBe("BRAND_READY");
 expect(historical.recipe?.executable).toBe(false);
});
