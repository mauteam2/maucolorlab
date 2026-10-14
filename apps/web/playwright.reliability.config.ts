import { defineConfig } from "@playwright/test";
import config from "./playwright.config";
export default defineConfig({ ...config, retries: 0, workers: 1, repeatEach: 10,
 outputDir: "test-results-reliability", reporter: [["line"], ["./e2e/reliability-reporter.ts", { output: "test-results-reliability/reliability-summary.json" }]],
 testMatch: ["hair-passport-edit.spec.ts", "hair-history.spec.ts", "auth.spec.ts", "risk.spec.ts"],
 grep: /create, edit core states|records exact, approximate and unknown history|real login auto-selects|real risk read stops/,
 webServer: { ...config.webServer as NonNullable<typeof config.webServer>, command: "npm run start -- --hostname 127.0.0.1 --port 4173" },
});
