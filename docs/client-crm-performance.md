# ELIFORA Phase 4B performance evidence

Measured inside disposable CI PostgreSQL on synthetic data: **303 clients / 905 appointments**, five repetitions per query. Values are database RPC wall time, including RLS, in milliseconds; they exclude HTTP/browser latency. The whole fixture rolls back. No production connection or customer data is used.

| Query | p50 ms | p95 ms |
| --- | ---: | ---: |
| Identity search | 433.27 | 438.30 |
| Filtered CRM list | 726.26 | 759.09 |
| Profile summary | 6.25 | 6.86 |
| Timeline first page | 5.30 | 6.20 |
| Action list | 1.27 | 1.41 |
| Duplicate candidate lookup | 106.30 | 107.20 |

Evidence: [CI run 37642528661](https://github.com/mauteam2/maucolorlab/actions/runs/37642528661), Database/RLS job 112865390385, `CRM_BENCHMARK` notices from `supabase/tests/client_crm.test.sql`. All thirty benchmark calls succeeded and all 1,036 database assertions passed. This checkpoint is fully green; its browser suite completed all 104 scenarios with one existing Hair Passport scenario passing on retry. Final release verification is recorded separately.

The directory scans at most 200 identity candidates and returns at most 50 rows. Pagination keeps a scan continuation even when a filtered slice has no matches. Timeline, actions and appointment history each have bounded independent pages; summary history samples use at most twelve same-service completions and six preferred-staff samples. No image/video download or storage signed URL is produced by these reads. Service/staff options are capped at 200.

Indexes reuse normalized-name/phone/email client search and client/date appointment indexes, plus CRM client/page, status/due date, preferred staff and alias-target indexes. Measurements are a small CI fixture, not a promise for every salon size or hardware. Larger datasets need further measurement before caching/materialization; cached signals are not introduced in this phase.
