-- Forward correction after the finance foundation was applied in disposable CI.
-- PostgreSQL JSON conversion routines are STABLE, not IMMUTABLE.
alter function app_private.finance_json(jsonb) stable;
