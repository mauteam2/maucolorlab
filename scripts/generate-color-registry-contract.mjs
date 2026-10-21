import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const ts = require("typescript");
const { z } = require("zod");
const source = readFileSync(new URL("../apps/web/lib/brand/registry-model.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", js)(require, mod, mod.exports);
const schemas = {};
for (const [name, schema] of Object.entries({ ColorRegistryQuery: mod.exports.registryQuery, ColorRegistryPage: mod.exports.registryPage })) {
 schemas[name] = z.toJSONSchema(schema, { target: "draft-2020-12", io: name.endsWith("Query") ? "input" : "output" });
 delete schemas[name].$schema;
}
// JSON Schema must also express the authority refinements in the runtime DTO.
const entry = schemas.ColorRegistryPage.properties.items.items;
entry.allOf = [
 { if: { properties: { recipeSupport: { const: true } } }, then: { properties: { state: { const: "PUBLISHED" }, catalogId: { type: "string", format: "uuid" }, region: { not: { const: "UNKNOWN" } }, ruleCount: { type: "integer", minimum: 1 } } } },
 { if: { properties: { recipeSupport: { const: false } } }, then: { properties: { catalogId: { type: "null" }, ruleCount: { const: 0 } } } },
];
writeFileSync(new URL("../contracts/color-registry.schemas.json", import.meta.url), JSON.stringify(schemas, null, 2) + "\n");
console.log("Generated shared discovery-only registry DTOs; no technical catalog changes");
