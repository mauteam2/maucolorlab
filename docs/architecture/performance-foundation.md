# Performance measurement foundation

Phase 0 avoids targets that would measure empty screens rather than product behavior. It establishes repeatable measurement points:

- Android CI records Gradle build duration; future startup work will add Macrobenchmark and Baseline Profile modules with cold-start targets.
- Next.js production builds expose route rendering mode and build duration; future user flows will add bundle budgets and Web Vitals reporting.
- Future critical service endpoints will record latency by operation and correlation ID without customer payloads or secrets.
- Future offline slices will benchmark initial hydration, queue drain, and conflict resolution with deterministic fixture sizes.

Every future budget must identify device/runtime class, dataset size, percentile, sampling window, and regression threshold before it can block a release.

