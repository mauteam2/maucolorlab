begin;
select plan(4);
select ok(pg_get_constraintdef(oid) like '%color-engine/1.0.0%' and pg_get_constraintdef(oid) like '%color-engine/1.1.0%', 'Historical and new evaluation versions remain allowed') from pg_constraint where conrelid='public.color_plans'::regclass and conname='color_plans_color_engine_version_check';
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.color_plans'::regclass),'Plan RLS and forced RLS retained');
select ok(not has_table_privilege('authenticated','public.color_plans','INSERT'),'No direct plan insertion grant');
select ok(exists(select 1 from pg_trigger where tgrelid='public.color_plans'::regclass and tgname='color_plans_guard' and tgenabled='O'),'Signed immutable plan guard retained');
select * from finish();
rollback;
