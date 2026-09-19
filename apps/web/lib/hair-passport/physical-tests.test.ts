import { expect, it } from "vitest";
import { physicalTestCommand, physicalTestResult } from "./physical-tests";
import fixtures from "../../../../contracts/fixtures/hair-physical-test-mutation.json";

it.each(fixtures.valid.map((command, index) => ({ command, index })))("accepts $command.payload.type and its existing read DTO", ({ command, index }) => {
 expect(physicalTestCommand.safeParse(command).success).toBe(true);
 expect(physicalTestResult.safeParse(fixtures.results[index]).success).toBe(true);
});
it.each(fixtures.invalid)("rejects $name", ({ payload }) => {
 expect(physicalTestCommand.safeParse({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, ...payload } }).success).toBe(false);
});
it("preserves explicit unknown/inapplicable states and requires a result", () => {
 for (const state of ["UNKNOWN", "NOT_APPLICABLE"]) {
  expect(physicalTestCommand.safeParse({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, result: { state, value: null } } }).success).toBe(true);
 }
 const payload = { ...fixtures.valid[0]!.payload, result: undefined };
 expect(physicalTestCommand.safeParse({ ...fixtures.valid[0], payload }).success).toBe(false);
});
