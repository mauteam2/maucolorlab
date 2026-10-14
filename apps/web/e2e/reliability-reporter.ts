import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Reporter, TestCase, TestResult, FullResult } from "@playwright/test/reporter";
export default class ReliabilityReporter implements Reporter {
 private results: { scenario: string; repetition: number; retry: number; status: string; duration_ms: number }[] = [];
 constructor(private options: { output?: string } = {}) {}
 onTestEnd(test: TestCase, result: TestResult) {
  this.results.push({ scenario: `${test.parent.project()?.name}:${test.location.file.split(/[\\/]/).pop()}:${test.location.line}`,
   repetition: test.repeatEachIndex, retry: result.retry, status: result.status, duration_ms: result.duration });
 }
 onEnd(result: FullResult) {
  const first = this.results.filter(r => r.retry === 0), retried = this.results.filter(r => r.retry > 0);
  const summary = { mode: "production-next-build-start", status: result.status, unique_scenarios: new Set(first.map(r => r.scenario)).size,
   first_run_passes: first.filter(r => r.status === "passed").length, first_run_failures: first.filter(r => ["failed", "timedOut", "interrupted"].includes(r.status)).length,
   retry_passes: retried.filter(r => r.status === "passed").length, retry_attempts: retried.length, skipped: first.filter(r => r.status === "skipped").length,
   repetitions: Math.max(0, ...first.map(r => r.repetition)) + 1, results: this.results };
  const output = this.options.output ?? "test-results/reliability-summary.json";
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(summary, null, 2));
  console.log("ELIFORA browser reliability:", JSON.stringify({ ...summary, results: undefined }));
 }
}
