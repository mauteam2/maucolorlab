import { describe, expect, it } from "vitest";
import { hairReadResult, hairReadRequest } from "./contracts";
import { readFixtures, cloneReadFixture, invalidReadFixture } from "@/test/hair-passport-fixtures";

it.each(["empty", "populated"] as const)("preserves %s snapshot through JSON serialization", name => {
 expect(hairReadResult.parse(JSON.parse(JSON.stringify(readFixtures[name])))).toEqual(readFixtures[name]);
});
it.each(readFixtures.invalid)("rejects malformed contract: $name", change => {
 expect(hairReadResult.safeParse(invalidReadFixture(change)).success).toBe(false);
});
it.each(readFixtures.errors)("maps shared $code envelope", error => {
 expect(hairReadResult.parse(error)).toEqual(error);
});
it("preserves KNOWN, UNKNOWN, NOT_ASSESSED and NOT_APPLICABLE without coercion", () => {
 const parsed = hairReadResult.parse(readFixtures.populated);
 expect("data" in parsed && parsed.data.core).toMatchObject({ state: "ASSESSED", observation: {
  natural_level: { state: "KNOWN", value: 5 }, porosity: { state: "UNKNOWN", value: null },
  density: { state: "NOT_ASSESSED", value: null }, tone: { state: "NOT_APPLICABLE", value: null },
 } });
});
it("retains all source identities including historical evidence", () => {
 const fixture = cloneReadFixture();
 fixture.data.history.items[0]!.evidence.source = "HISTORICAL";
 expect(hairReadResult.parse(fixture)).toEqual(fixture);
});
describe("semantic integrity beyond field shape", () => {
 it("rejects unrelated regional observation", () => {
  const f = cloneReadFixture(); f.data.regions[0]!.assessment.observation.region_id = f.data.passport.id;
  expect(hairReadResult.safeParse(f).success).toBe(false);
 });
 it("rejects history referencing an absent region", () => {
  const f = cloneReadFixture(); f.data.history.items[0]!.region_ids = [f.data.passport.id];
  expect(hairReadResult.safeParse(f).success).toBe(false);
 });
 it("rejects whole-hair observation with a region", () => {
  const f = cloneReadFixture();
  const invalid = { ...f, data: { ...f.data, core: { ...f.data.core, observation: { ...f.data.core.observation, region_id: f.data.regions[0]!.id } } } };
  expect(hairReadResult.safeParse(invalid).success).toBe(false);
 });
 it("rejects duplicate region identity", () => {
  const f = cloneReadFixture(); f.data.regions.push(f.data.regions[0]!);
  expect(hairReadResult.safeParse(f).success).toBe(false);
 });
 it("rejects broken pagination", () => {
  const f = cloneReadFixture(); f.data.history.has_more = true;
  expect(hairReadResult.safeParse(f).success).toBe(false);
 });
 it("rejects future physical test timestamp", () => {
  const f = cloneReadFixture(); f.data.physical_tests.items[0]!.performed_at = "2099-01-01T00:00:00Z";
  expect(hairReadResult.safeParse(f).success).toBe(false);
 });
 it("rejects relevance before observation", () => {
  const f = cloneReadFixture();
  const invalid = { ...f, data: { ...f.data, core: { ...f.data.core, observation: { ...f.data.core.observation,
   evidence: { ...f.data.core.observation.evidence, relevant_until: "2000-01-01T00:00:00Z" } } } } };
  expect(hairReadResult.safeParse(invalid).success).toBe(false);
 });
});
it.each([
 { organization_id: readFixtures.empty.data.passport.id },
 { passport_id: readFixtures.empty.data.passport.id }, { include_archived: "true" },
 { page_size: 101 }, { tests_offset: -1 }, { history_offset: 0.5 },
])("rejects forged scope or malformed read options %j", options => {
 expect(hairReadRequest.safeParse({ client_id: readFixtures.empty.data.passport.client_id, options }).success).toBe(false);
});
