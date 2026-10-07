# ELIFORA Phase 4B performance evidence

Measured inside disposable CI PostgreSQL on synthetic data: **303 clients / 905 appointments**, five repetitions per query. Values are database RPC wall time, including RLS, in milliseconds; they exclude HTTP/browser latency. The whole fixture rolls back. No production connection or customer data is used.

| Query | p50 ms | p95 ms |
| --- | ---: | ---: |
| Identity search | 437.03 | 441.55 |
| Filtered CRM list | 707.67 | 725.23 |
| Profile summary | 6.48 | 7.01 |
| Timeline first page | 5.24 | 6.10 |
| Action list | 1.25 | 1.46 |
| Duplicate candidate lookup | 107.80 | 108.42 |

Evidence: CI run 37636922623, Database/RLS job 112846322116, `CRM_BENCHMARK` notices from `supabase/tests/client_crm.test.sql`. All thirty benchmark calls succeeded and all 1,032 database assertions passed. This checkpoint separately exposed a Web accessibility regression in the new CRM browser flow; these measurements do not imply that the checkpoint was fully green. Final release verification is recorded separately.

The directory scans at most 200 identity candidates and returns at most 50 rows. Pagination keeps a scan continuation even when a filtered slice has no matches. Timeline, actions and appointment history each have bounded independent pages; summary history samples use at most twelve same-service completions and six preferred-staff samples. No image/video download or storage signed URL is produced by these reads. Service/staff options are capped at 200.

Indexes reuse normalized-name/phone/email client search and client/date appointment indexes, plus CRM client/page, status/due date, preferred staff and alias-target indexes. Measurements are a small CI fixture, not a promise for every salon size or hardware. Larger datasets need further measurement before caching/materialization; cached signals are not introduced in this phase.
