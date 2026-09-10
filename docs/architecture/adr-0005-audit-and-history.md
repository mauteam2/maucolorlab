# ADR 0005: Append-oriented audit and controlled history

- Status: Accepted
- Date: 2026-09-10

## Decision

Record critical activity as append-only audit events containing actor, tenant, optional location, action, entity reference, reason, bounded metadata, timestamp, and correlation ID. Reject updates and deletes at the database layer. Model future critical history with explicit versions or reversals rather than last-write-wins updates.

## Consequences

Normal clients cannot insert or rewrite audit rows. Server operations are responsible for adding focused events without secrets or unnecessary customer payloads. Corrections create new history instead of erasing attribution.

