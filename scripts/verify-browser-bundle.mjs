import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
const statusPath = process.env.ELIFORA_TEST_STATUS_FILE;
if (!statusPath) throw new Error("Local test status file required");
const status = JSON.parse(readFileSync(statusPath, "utf8"));
if (status.API_URL !== "http://127.0.0.1:54321" || !status.SERVICE_ROLE_KEY) {
  throw new Error("Only disposable local test configuration is accepted");
}
let count = 0;
const signingKey = process.env.ELIFORA_COLOR_PLAN_SIGNING_KEY;
if (!signingKey || !/^[a-f0-9]{64}$/.test(signingKey)) throw new Error("Local planning signing configuration required");
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else {
      count++;
      const content = readFileSync(path);
      if ([status.SERVICE_ROLE_KEY, signingKey].some(key => content.includes(Buffer.from(key)))) {
        throw new Error("Privileged local key found in a browser artifact");
      }
    }
  }
}
scan(resolve("apps/web/.next/static"));
if (!count) throw new Error("Browser build artifacts missing");
console.log("PASS: no local privileged key in " + count + " browser artifacts");
