import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TestCase, TestResult, FullResult } from "@playwright/test/reporter";
const output = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("node:fs", async importOriginal => {
 const actual = await importOriginal<typeof import("node:fs")>();
 const mocked = { ...actual, mkdirSync: vi.fn(), writeFileSync: output.write };
 return { ...mocked, default: mocked };
});
import ReliabilityReporter from "../../e2e/reliability-reporter";
const scenario = (name: string, repetition = 0) => ({ parent: { project: () => ({ name: "chromium" }) }, location: { file: "/synthetic/example.spec.ts", line: 3 }, titlePath: () => ["chromium", "example.spec.ts", name], repeatEachIndex: repetition }) as unknown as TestCase;
const result = (status = "passed", retry = 0) => ({ status, retry, duration: 1 }) as TestResult;
const finish = (reporter: ReliabilityReporter) => { reporter.onEnd({ status: "passed" } as FullResult); return JSON.parse(output.write.mock.calls.at(-1)![1]); };
beforeEach(() => { output.write.mockReset(); vi.spyOn(console, "log").mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());
it("counts parameterized tests on the same source line separately and repetitions once", () => {
 const reporter = new ReliabilityReporter(); for (let i = 0; i < 10; i++) reporter.onTestEnd(scenario("dashboard", i), result());
 reporter.onTestEnd(scenario("clients"), result());
 expect(finish(reporter)).toMatchObject({ unique_scenarios: 2, first_run_passes: 11, repetitions: 10, retry_attempts: 0 });
});
it("does not turn a retry success into a first-run pass", () => {
 const reporter = new ReliabilityReporter(); reporter.onTestEnd(scenario("history"), result("failed")); reporter.onTestEnd(scenario("history"), result("passed", 1));
 expect(finish(reporter)).toMatchObject({ unique_scenarios: 1, first_run_passes: 0, first_run_failures: 1, retry_passes: 1, retry_attempts: 1 });
});
