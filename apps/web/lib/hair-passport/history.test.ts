import { expect, it } from "vitest";
import { historyCommand, historyResult } from "./history";
import fixtures from "../../../../contracts/fixtures/hair-history-mutation.json";

it.each(fixtures.valid.map((command, index) => ({ command, index })))("accepts $command.payload.category with its read DTO", ({ command, index }) => {
 expect(historyCommand.safeParse(command).success).toBe(true);
 expect(historyResult.safeParse(fixtures.results[index]).success).toBe(true);
});
it.each(fixtures.invalid)("rejects $name", ({ payload }) => {
 expect(historyCommand.safeParse({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, ...payload } }).success).toBe(false);
});
it("supports each schema category without adding interpretation", () => {
 for (const category of ["COLOR","BLEACH_LIGHTENING","TONER_GLOSS","PERM","RELAXER_STRAIGHTENING","KERATIN_SMOOTHING","OTHER_CHEMICAL"]) {
  expect(historyCommand.safeParse({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, category } }).success).toBe(true);
 }
});
it("preserves exact approximate unknown and product states", () => {
 for (const performed_on of [{ state: "EXACT", value: "2025-01-01" }, { state: "APPROXIMATE", value: "2024-01-01" }, { state: "UNKNOWN", value: null }]) {
  expect(historyCommand.safeParse({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, performed_on } }).success).toBe(true);
 }
 for (const product of [{ state: "KNOWN", value: "Synthetic" }, { state: "UNKNOWN", value: null }, { state: "NOT_APPLICABLE", value: null }]) {
  expect(historyCommand.safeParse({ ...fixtures.valid[0], payload: { ...fixtures.valid[0]!.payload, product } }).success).toBe(true);
 }
});
