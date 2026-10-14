"""Explicit neutral SaaS fixture for disposable CI regression domains only.

Never a migration, production default, caller-granted plan or payment integration.
New Phase 7 tests replace this fixture state through the actual control boundary.
"""
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
assert os.environ.get("CI") == "true", "Disposable CI only"
assert 'project_id = "elifora"' in (ROOT / "supabase/config.toml").read_text()
sql = """
insert into app_private.saas_plans(id,code,label,development_only)
 values('f7000000-0000-4000-8000-000000000001','PLAN_A','PLAN_A · development fixture',true);
insert into app_private.saas_plan_versions(id,plan_id,version,actor,reason)
 values('f7000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000001',1,'CI_FIXTURE','Explicit disposable source-domain regression configuration');
insert into app_private.saas_plan_entitlements select 'f7000000-0000-4000-8000-000000000002',cap,true
 from unnest(array['COLOR_ENGINE','BRAND_ADAPTER','LIVE_SESSION','CRM','STOCK','FINANCE','COSTING','COMMISSION','REPORTING','AI_GATEWAY']) cap;
insert into app_private.saas_plan_quotas select 'f7000000-0000-4000-8000-000000000002',code,null
 from unnest(array['LOCATIONS','ACTIVE_MEMBERS','STORAGE_BYTES','ENGINE_EXECUTIONS']) code;
create function app_private.ci_saas_fixture() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 if (select version from app_private.saas_accounts where organization_id=new.organization_id)=0 then
  insert into app_private.saas_subscriptions(organization_id,version,plan_version_id,status,effective_from,source,actor,reason,correlation_id)
   values(new.organization_id,1,'f7000000-0000-4000-8000-000000000002','ACTIVE',statement_timestamp(),'BOOTSTRAP','CI_FIXTURE','Disposable regression fixture, not commercial policy',gen_random_uuid()) returning id into sid;
  update app_private.saas_accounts set version=1,status='ACTIVE',subscription_id=sid,activated_at=statement_timestamp() where organization_id=new.organization_id;
  insert into app_private.saas_usage_periods(organization_id,period_start,period_end,source,actor,reason)
   values(new.organization_id,date_trunc('month',statement_timestamp() at time zone 'UTC') at time zone 'UTC',
    (date_trunc('month',statement_timestamp() at time zone 'UTC')+interval '1 month') at time zone 'UTC','CI_FIXTURE','CI_FIXTURE','Explicit synthetic UTC period');
 end if;return new;
end$$;
revoke all on function app_private.ci_saas_fixture() from public,anon,authenticated,service_role;
-- BEFORE row: multi-row location fixtures need the configured account before
-- the second location's quota guard. This fixture trigger sorts before it.
create trigger a_ci_saas_fixture before insert on public.locations for each row execute function app_private.ci_saas_fixture();
"""
subprocess.run(["docker", "exec", "-i", "supabase_db_elifora", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], input=sql, text=True, check=True)
print("Configured explicit disposable PLAN_A regression fixture; application defaults unchanged.")
