import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
const statusPath = process.env.ELIFORA_TEST_STATUS_FILE;
if (!statusPath) throw new Error("Local test status file required");
const status = JSON.parse(readFileSync(statusPath, "utf8"));
if (status.API_URL !== "http://127.0.0.1:54321" || !status.SERVICE_ROLE_KEY) {
  throw new Error("Only disposable local test configuration is accepted");
}
let count = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else {
      count++;
      if (readFileSync(path).includes(Buffer.from(status.SERVICE_ROLE_KEY))) {
        throw new Error("Privileged local key found in a browser artifact");
      }
    }
  }
}
scan(resolve("apps/web/.next/static"));
if (!count) throw new Error("Browser build artifacts missing");
console.log("PASS: no local privileged key in " + count + " browser artifacts");
