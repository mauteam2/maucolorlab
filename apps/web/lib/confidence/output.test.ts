import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { goldenInput, fixtureId } from "@/test/confidence-fixtures";
import { evaluateConfidence } from "./engine";
it("keeps the shared result example consistent with engine metadata and explained domains", () => {
 const path = resolve(process.cwd(), "../../contracts/fixtures/confidence-result.json");
 const result = {data: evaluateConfidence(goldenInput()), correlationId: fixtureId(500)};
 if (process.env.ELIFORA_UPDATE_CONFIDENCE_FIXTURES === "1") writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
 const example = JSON.parse(readFileSync(path, "utf8"));
 expect(example.data.engineVersion).toBe(result.data.engineVersion);
 expect(example.data.rulesFingerprint).toBe(result.data.rulesFingerprint);
 expect(example.data.confidence).toBe(result.data.confidence);
 expect(example.data.domains.map((d: {domain: string}) => d.domain)).toEqual(result.data.domains.map(d => d.domain));
});
