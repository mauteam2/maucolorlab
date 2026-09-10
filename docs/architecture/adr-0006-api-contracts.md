# ADR 0006: OpenAPI is the critical service contract

- Status: Accepted
- Date: 2026-09-10

## Decision

Keep an OpenAPI document in `contracts/openapi.yaml` as the source of truth for critical service shapes. Phase 0 defines reusable error and correlation components without inventing unused endpoints. Future slices add endpoints and generate or validate platform types in CI.

## Consequences

Android and Web receive the same authorization, validation, conflict, and domain error vocabulary. Contract changes are reviewed alongside the vertical slice that uses them.

