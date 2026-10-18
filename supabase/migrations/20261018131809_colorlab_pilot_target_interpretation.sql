-- New evaluations retain a versioned qualitative target interpretation.
-- Historical signatures, payloads, receipts and catalog attribution are untouched.
alter table public.color_plans drop constraint color_plans_color_engine_version_check;
alter table public.color_plans add constraint color_plans_color_engine_version_check
 check(color_engine_version in ('color-engine/1.0.0','color-engine/1.1.0'));
