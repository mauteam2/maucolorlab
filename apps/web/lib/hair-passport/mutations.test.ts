import { expect, it } from "vitest";
import fixtures from "../../../../contracts/fixtures/hair-core-mutation.json";
import { hairMutationCommand, hairMutationResult } from "./mutations";
import { hairAssessment } from "./contracts";

it.each(fixtures.valid)("accepts shared $operation request without manufacturing omitted fields", command => {
 expect(hairMutationCommand.parse(command)).toEqual(command);
});
it.each(fixtures.invalid)("rejects $name", entry => {
 const base = fixtures.valid[entry.base]!;
 expect(hairMutationCommand.safeParse({ ...base, payload: { ...base.payload, ...entry.payload } }).success).toBe(false);
});
it("accepts minimal, unverified and region results through the shared strict model", () => {
 for (const result of [fixtures.created, fixtures.enriched, fixtures.region]) expect(hairMutationResult.safeParse(result).success).toBe(true);
 expect(hairAssessment.safeParse(fixtures.enriched.data.core).success).toBe(true);
 expect(hairAssessment.safeParse({ ...fixtures.enriched.data.core, evidence: {} }).success).toBe(false);
});
