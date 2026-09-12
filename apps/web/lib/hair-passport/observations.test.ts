import { expect, it } from "vitest";
import fixtures from "../../../../contracts/fixtures/hair-observation-mutation.json";
import { observationCommand, observationResult } from "./observations";
import { hairAssessment } from "./contracts";

it.each(fixtures.valid)("accepts $payload.evidence.source with original explicit states", command => {
 expect(observationCommand.parse(command)).toEqual(command);
});
it.each(fixtures.invalid)("rejects $name", invalid => {
 expect(observationCommand.safeParse({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, ...invalid.payload } }).success).toBe(false);
});
it("all five sources use the existing observation read shape", () => {
 for (const result of fixtures.results) {
  expect(observationResult.safeParse(result).success).toBe(true);
  expect(hairAssessment.safeParse({ state: "ASSESSED", observation: result.data.observation }).success).toBe(true);
 }
});
