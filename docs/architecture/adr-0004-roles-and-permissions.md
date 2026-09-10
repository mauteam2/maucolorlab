# ADR 0004: Roles map to permissions

- Status: Accepted
- Date: 2026-09-10

## Decision

Represent the five product roles as stable role codes and map them to granular permission codes in relational tables. Resolve permissions from current memberships in the database or server service. Keep professional competency separate from authorization.

## Consequences

Client-supplied role claims have no authority. New permissions can be introduced without changing membership rows, while changes to role mappings remain reviewed database migrations. A future competency engine will not be overloaded with access-control concerns.

