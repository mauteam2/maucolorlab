import { test as base, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
export { expect };
export const test = base.extend<{ sanitizedDiagnostics: void }>({
 sanitizedDiagnostics: [async ({ page }, use, info) => {
  const records: { route: string; status: number | string; elapsed_ms: number; correlation_id: string | null }[] = [], start = Date.now();
  const route = (raw: string) => new URL(raw).pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":entity");
  page.on("response", response => { const path = route(response.url()); if (!path.startsWith("/api/")) return;
   const id = response.headers()["x-correlation-id"];
   records.push({ route: path, status: response.status(), elapsed_ms: Date.now() - start, correlation_id: id && /^[a-f0-9-]{36}$/i.test(id) ? id : null });
  });
  page.on("requestfailed", request => { const path = route(request.url()); if (path.startsWith("/api/")) records.push({ route: path, status: "TRANSPORT_FAILED", elapsed_ms: Date.now() - start, correlation_id: null }); });
  await use();
  const state = await page.evaluate(() => ({ hidden: document.hidden, online: navigator.onLine, busy_forms: document.querySelectorAll('[aria-busy="true"]').length,
   loading_statuses: document.querySelectorAll('[role="status"]').length, document_width: document.documentElement.scrollWidth, viewport_width: window.innerWidth })).catch(() => null);
  const diagnostics = info.outputPath("sanitized-route-diagnostics.json");
  await writeFile(diagnostics, JSON.stringify({ state, records: records.slice(-150) }));
  await info.attach("sanitized-route-diagnostics", { path: diagnostics, contentType: "application/json" });
  // Body-only attachments belong to the reporter, not the per-test output
  // directory. Persist only these explicitly sanitized numeric measurements.
  for (const attachment of info.attachments) {
   if (/^(?:phase-(?:8|9)-|color-pilot-)[a-z0-9-]+$/.test(attachment.name) && attachment.contentType === "application/json" && attachment.body) {
    await writeFile(info.outputPath(`${attachment.name}.json`), attachment.body);
   }
  }
 }, { auto: true }],
});
