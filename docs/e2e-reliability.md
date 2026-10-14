# ELIFORA production browser evidence

CI builds with the disposable local Supabase public configuration and uses
`next start` for the browser gates/full suite. Build and browser-bundle verification
remain independent checks. Private/API credentials never enter public bundles;
auth traces and storage-state files are disabled.

`playwright.reliability.config.ts` runs representative real Hair editing, history,
login/logout/browser restart and Risk paths ten times on desktop and mobile with
one worker and retries=0. These repetitions are stability evidence for existing
scenarios, not additional unique E2E coverage. Phase 8 offline journeys also have a
dedicated retries=0 gate. The full suite retains its existing diagnostic retry policy.

The reporter separates unique scenarios, first-run passes/failures, retry passes,
retry attempts, skips and repetition indexes. A retry is never counted as a clean
first pass. Sanitized diagnostics retain route (entity UUIDs replaced), status,
correlation ID, elapsed time, online/visibility state, busy-form count and viewport
size. They contain no request/response body, cookies, tokens, passwords or salon
customer payload. Waits use server responses, committed versions and stable UI
conditions; no arbitrary sleep or increased-timeout workaround closes G1-09.

The targeted Hair regression test proves that the periodic refresh cannot abort
or supersede an in-flight save and its committed readback. Focus/visibility/authority
denial tests still conceal private state. Final closure requires a green exact-head
CI, no-retry affected journeys and the actual ten-repetition production evidence;
configuration or a delivery narrative alone is insufficient.

G1-10 (reception technical projection) and G1-11 (legacy RPC coverage) remain tracked
for Phase 9. They are not closed or remediated by this reliability phase.
