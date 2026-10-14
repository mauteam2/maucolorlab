-- ELIFORA SaaS control plane. No prices, trial length or live billing provider.
do $$begin if not exists(select 1 from pg_roles where rolname='elifora_saas_operator') then create role elifora_saas_operator nologin noinherit;end if;end$$;
grant usage on schema app_private to elifora_saas_operator;
insert into public.permissions(code,description) values
 ('saas.entitlements.read','Read current organization capability availability'),
 ('saas.subscription.view','Inspect organization subscription governance'),
 ('saas.subscription.manage','Request organization subscription changes'),
 ('saas.usage.view','Inspect organization usage and configured quotas');
insert into public.role_permissions(role_code,permission_code)
 select 'owner',p from unnest(array['saas.subscription.view','saas.subscription.manage','saas.usage.view']) p;
insert into public.role_permissions(role_code,permission_code)
 select r,'saas.entitlements.read' from unnest(array['owner','manager','colorist','assistant','reception']) r;

create table app_private.saas_plans(
 id uuid primary key default gen_random_uuid(),code text not null unique check(code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
 label text not null check(length(label) between 1 and 120),development_only boolean not null default false,
 created_at timestamptz not null default statement_timestamp()
);
create table app_private.saas_plan_versions(
 id uuid primary key default gen_random_uuid(),plan_id uuid not null references app_private.saas_plans(id),
 version bigint not null check(version>0),created_at timestamptz not null default statement_timestamp(),
 actor text not null check(length(actor) between 1 and 160),reason text not null check(length(reason) between 1 and 500),
 unique(plan_id,version)
);
create table app_private.saas_plan_entitlements(
 plan_version_id uuid not null references app_private.saas_plan_versions(id),capability text not null,
 enabled boolean not null,primary key(plan_version_id,capability),
 check(capability in ('COLOR_ENGINE','BRAND_ADAPTER','LIVE_SESSION','CRM','STOCK','FINANCE','COSTING','COMMISSION','REPORTING','AI_GATEWAY'))
);
create table app_private.saas_plan_quotas(
 plan_version_id uuid not null references app_private.saas_plan_versions(id),code text not null,
 limit_value bigint check(limit_value>=0),primary key(plan_version_id,code),
 check(code in ('LOCATIONS','ACTIVE_MEMBERS','STORAGE_BYTES','ENGINE_EXECUTIONS'))
 -- A present row with NULL limit is explicitly configured uncapped. Missing is UNKNOWN.
);
create table app_private.saas_subscriptions(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 version bigint not null check(version>0),plan_version_id uuid references app_private.saas_plan_versions(id),
 status text not null check(status in ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED','CANCELLED','UNCONFIGURED')),
 effective_from timestamptz not null,effective_until timestamptz,
 trial_end timestamptz,grace_end timestamptz,source text not null check(source in ('PLATFORM','PROVIDER','BOOTSTRAP')),
 provider text,provider_customer_ref text,provider_subscription_ref text,
 actor text not null,reason text not null,correlation_id uuid not null,
 created_at timestamptz not null default statement_timestamp(),
 unique(organization_id,version),unique(organization_id,id),
 check(effective_until is null or effective_until>effective_from),
 check(status<>'TRIAL' or trial_end is not null and trial_end>effective_from),
 check(grace_end is null or grace_end>effective_from),
 check(length(actor) between 1 and 160 and length(reason) between 1 and 500),
 check(status='UNCONFIGURED' or plan_version_id is not null)
);
create table app_private.saas_accounts(
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 subscription_id uuid,version bigint not null default 0,status text not null default 'UNCONFIGURED',
 created_at timestamptz not null default statement_timestamp(),activated_at timestamptz,suspended_at timestamptz,closed_at timestamptz,
 foreign key(organization_id,subscription_id) references app_private.saas_subscriptions(organization_id,id),
 check(status in ('ACTIVE','TRIAL','PAST_DUE','SUSPENDED','CANCELLED','UNCONFIGURED'))
);
create table app_private.saas_usage_periods(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 period_start timestamptz not null,period_end timestamptz not null,source text not null,actor text not null,reason text not null,
 created_at timestamptz not null default statement_timestamp(),check(period_end>period_start),
 unique(organization_id,id),unique(organization_id,period_start),
 exclude using gist(organization_id extensions.gist_uuid_ops with =,tstzrange(period_start,period_end,'[)') with &&)
);
create table app_private.saas_usage_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 location_id uuid,period_id uuid not null,category text not null check(category in ('ENGINE_EXECUTIONS','STORAGE_BYTES')),
 source_domain text not null,source_id uuid not null,quantity bigint not null check(quantity<>0),
 occurred_at timestamptz not null default statement_timestamp(),source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 foreign key(organization_id,period_id) references app_private.saas_usage_periods(organization_id,id),
 foreign key(organization_id,location_id) references public.locations(organization_id,id),
 unique(organization_id,category,source_domain,source_id)
);
create index saas_usage_period_category on app_private.saas_usage_events(organization_id,period_id,category);
create table app_private.saas_usage_counters(
 organization_id uuid not null,period_id uuid not null,category text not null,quantity bigint not null,
 rebuilt_at timestamptz not null default statement_timestamp(),primary key(organization_id,period_id,category),
 foreign key(organization_id,period_id) references app_private.saas_usage_periods(organization_id,id) on delete cascade
);
create table app_private.saas_provider_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 provider text not null check(length(provider) between 1 and 80),external_event_id text not null check(length(external_event_id) between 1 and 200),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),verified boolean not null check(verified),
 received_at timestamptz not null default statement_timestamp(),unique(provider,external_event_id)
);
create table app_private.saas_provider_results(
 event_id uuid primary key references app_private.saas_provider_events(id) on delete cascade,
 status text not null check(status in ('APPLIED','REJECTED')),code text,subscription_id uuid,
 processed_at timestamptz not null default statement_timestamp()
);
create table app_private.saas_change_requests(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 actor_user_id uuid not null references public.profiles(user_id),request_id uuid not null,reason text not null check(length(reason) between 1 and 500),
 created_at timestamptz not null default statement_timestamp(),unique(organization_id,actor_user_id,request_id)
);
create table app_private.saas_rejections(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id) on delete cascade,
 category text not null check(category in ('ENTITLEMENT','QUOTA','SUBSCRIPTION')),code text not null,
 correlation_id uuid not null unique,created_at timestamptz not null default statement_timestamp()
);

do $$declare t text;begin
 foreach t in array array['saas_plans','saas_plan_versions','saas_plan_entitlements','saas_plan_quotas','saas_subscriptions','saas_accounts',
 'saas_usage_periods','saas_usage_events','saas_usage_counters','saas_provider_events','saas_provider_results','saas_change_requests','saas_rejections'] loop
  execute format('alter table app_private.%I enable row level security',t);
  execute format('revoke all on app_private.%I from public,anon,authenticated,service_role,elifora_saas_operator',t);
 end loop;
 foreach t in array array['saas_plans','saas_plan_versions','saas_plan_entitlements','saas_plan_quotas','saas_subscriptions','saas_usage_periods','saas_usage_events','saas_provider_events','saas_provider_results','saas_change_requests','saas_rejections'] loop
  execute format('create trigger saas_history_immutable before update or delete on app_private.%I for each row execute function app_private.live_immutable()',t);
 end loop;
end$$;

create function app_private.saas_account_bootstrap() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into app_private.saas_accounts(organization_id) values(new.id);return new;end$$;
create trigger saas_account_identity after insert on public.organizations for each row execute function app_private.saas_account_bootstrap();
insert into app_private.saas_accounts(organization_id) select id from public.organizations;
revoke all on function app_private.saas_account_bootstrap() from public,anon,authenticated,service_role;

create function app_private.saas_current(org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a app_private.saas_accounts%rowtype;s app_private.saas_subscriptions%rowtype;state text;allowed boolean;begin
 select * into a from app_private.saas_accounts where organization_id=org;
 if not found then return jsonb_build_object('status','UNCONFIGURED','version',0,'plan_version_id',null,'creation_allowed',false);end if;
 select * into s from app_private.saas_subscriptions where id=a.subscription_id;
 state:=coalesce(s.status,'UNCONFIGURED');
 if s.effective_from>statement_timestamp() then state:='UNCONFIGURED';
 elsif s.effective_until is not null and s.effective_until<=statement_timestamp() then state:='EXPIRED';
 elsif state='TRIAL' and s.trial_end<=statement_timestamp() then state:='TRIAL_EXPIRED';
 elsif state='PAST_DUE' and s.grace_end is not null and s.grace_end>statement_timestamp() then state:='GRACE';end if;
 allowed:=state in ('ACTIVE','TRIAL','GRACE');
 return jsonb_build_object('status',state,'version',a.version,'subscription_id',a.subscription_id,'plan_version_id',s.plan_version_id,
  'creation_allowed',allowed,'effective_from',s.effective_from,'effective_until',s.effective_until,'trial_end',s.trial_end,'grace_end',s.grace_end);
end$$;
revoke all on function app_private.saas_current(uuid) from public,anon,authenticated,service_role;

-- All premium transactions share this lock until commit. Control-plane changes
-- take its exclusive counterpart and re-read the current version under lock.
create function app_private.saas_require(org uuid,cap text) returns void language plpgsql volatile security definer set search_path='' as $$
declare s jsonb;enabled boolean;begin
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text||':saas',71));
 s:=app_private.saas_current(org);
 if not (s->>'creation_allowed')::boolean then raise exception using errcode='P0001',message=case when s->>'status'='UNCONFIGURED' then 'SAAS_UNCONFIGURED' else 'SUBSCRIPTION_RESTRICTED' end;end if;
 select e.enabled into enabled from app_private.saas_plan_entitlements e where e.plan_version_id=(s->>'plan_version_id')::uuid and e.capability=cap;
 if enabled is distinct from true then raise exception using errcode='P0001',message='FEATURE_UNAVAILABLE';end if;
end$$;
revoke all on function app_private.saas_require(uuid,text) from public,anon,authenticated,service_role;

create function app_private.saas_quota(org uuid,code text,delta bigint) returns void language plpgsql volatile security definer set search_path='' as $$
declare s jsonb;bound bigint;used bigint;pid uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(org::text||':saas',71));
 s:=app_private.saas_current(org);
 if not (s->>'creation_allowed')::boolean then raise exception using errcode='P0001',message='SUBSCRIPTION_RESTRICTED';end if;
 select q.limit_value into bound from app_private.saas_plan_quotas q where q.plan_version_id=(s->>'plan_version_id')::uuid and q.code=saas_quota.code;
 if not found then raise exception using errcode='P0001',message='QUOTA_UNKNOWN';end if;
 if code='LOCATIONS' then select count(*) into used from public.locations where organization_id=org and archived_at is null;
 elsif code='ACTIVE_MEMBERS' then select count(distinct user_id) into used from public.salon_memberships where organization_id=org and status in ('active','invited');
 else
  select id into pid from app_private.saas_usage_periods where organization_id=org and period_start<=statement_timestamp() and period_end>statement_timestamp();
  if pid is null then raise exception using errcode='P0001',message='USAGE_PERIOD_UNKNOWN';end if;
  select coalesce(sum(quantity),0) into used from app_private.saas_usage_events where organization_id=org and period_id=pid and category=code;
 end if;
 if bound is not null and used+delta>bound then raise exception using errcode='P0001',message='QUOTA_EXCEEDED';end if;
end$$;
revoke all on function app_private.saas_quota(uuid,text,bigint) from public,anon,authenticated,service_role;

create function app_private.saas_record_usage(org uuid,loc uuid,category text,domain text,source uuid,amount bigint,hash text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare old app_private.saas_usage_events%rowtype;pid uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(org::text||':saas',71));
 select * into old from app_private.saas_usage_events where organization_id=org and saas_usage_events.category=saas_record_usage.category and source_domain=domain and source_id=source;
 if found then
  if old.quantity<>amount or old.source_hash<>hash or old.location_id is distinct from loc then raise exception using errcode='P0001',message='USAGE_REPLAY_CONFLICT';end if;return;
 end if;
 perform app_private.saas_quota(org,category,amount);
 select id into pid from app_private.saas_usage_periods where organization_id=org and period_start<=statement_timestamp() and period_end>statement_timestamp();
 insert into app_private.saas_usage_events(organization_id,location_id,period_id,category,source_domain,source_id,quantity,source_hash)
  values(org,loc,pid,category,domain,source,amount,hash);
 insert into app_private.saas_usage_counters(organization_id,period_id,category,quantity) values(org,pid,category,amount)
  on conflict(organization_id,period_id,category) do update set quantity=saas_usage_counters.quantity+excluded.quantity,rebuilt_at=statement_timestamp();
end$$;
revoke all on function app_private.saas_record_usage(uuid,uuid,text,text,uuid,bigint,text) from public,anon,authenticated,service_role;

create function app_private.saas_control(org uuid,q jsonb,actor text,reason text,corr uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare op text:=q->>'type';a app_private.saas_accounts%rowtype;pv uuid;eid uuid;pid uuid;state text;row_entry record;old jsonb;v bigint;begin
 if org is null or corr is null or length(actor) not between 1 and 160 or length(reason) not between 1 and 500
  or jsonb_typeof(q)<>'object' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text,0));
 perform pg_advisory_xact_lock(hashtextextended(org::text||':saas',71));
 select * into a from app_private.saas_accounts where organization_id=org;
 if not found then raise exception using errcode='22023',message='SAAS_ACCOUNT_NOT_FOUND';end if;
 old:=app_private.saas_current(org);
 if op='PLAN_VERSION' then
  if exists(select 1 from jsonb_object_keys(q) k where k not in ('type','code','label','development_only','expected_version','entitlements','quotas'))
   or jsonb_typeof(q->'entitlements')<>'object' or jsonb_typeof(q->'quotas')<>'object'
   or (select count(*) from jsonb_object_keys(q->'entitlements'))>10 or (select count(*) from jsonb_object_keys(q->'quotas'))>4 then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
  perform pg_advisory_xact_lock(hashtextextended('saas-plan:'||(q->>'code'),72));
  select id into pid from app_private.saas_plans where code=q->>'code';
  if pid is null then
   insert into app_private.saas_plans(code,label,development_only) values(q->>'code',q->>'label',coalesce((q->>'development_only')::boolean,false)) returning id into pid;
  end if;
  select coalesce(max(version),0) into v from app_private.saas_plan_versions where plan_id=pid;
  if (q->>'expected_version')::bigint is distinct from v then raise exception using errcode='P0001',message='SAAS_VERSION_CONFLICT';end if;
  insert into app_private.saas_plan_versions(plan_id,version,actor,reason) values(pid,v+1,actor,reason) returning id into pv;
  for row_entry in select key,value from jsonb_each(q->'entitlements') loop
   if jsonb_typeof(row_entry.value)<>'boolean' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
   insert into app_private.saas_plan_entitlements values(pv,row_entry.key,(row_entry.value#>>'{}')::boolean);
  end loop;
  for row_entry in select key,value from jsonb_each(q->'quotas') loop
   if jsonb_typeof(row_entry.value) not in ('number','null') or row_entry.value::text ~ '[.eE]' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
   -- Finite storage limits require the later authoritative Storage adapter.
   if row_entry.key='STORAGE_BYTES' and row_entry.value<>'null'::jsonb then raise exception using errcode='P0001',message='STORAGE_METER_UNAVAILABLE';end if;
   insert into app_private.saas_plan_quotas values(pv,row_entry.key,(row_entry.value#>>'{}')::bigint);
  end loop;
 elsif op='SUBSCRIPTION' then
  if exists(select 1 from jsonb_object_keys(q) k where k not in ('type','expected_version','plan_version_id','status','effective_until','trial_end','grace_end','provider','provider_customer_ref','provider_subscription_ref','source'))
   or (q->>'expected_version')::bigint is distinct from a.version then raise exception using errcode='P0001',message='SAAS_VERSION_CONFLICT';end if;
  pv:=(q->>'plan_version_id')::uuid;state:=q->>'status';
  insert into app_private.saas_subscriptions(organization_id,version,plan_version_id,status,effective_from,effective_until,trial_end,grace_end,source,provider,provider_customer_ref,provider_subscription_ref,actor,reason,correlation_id)
   values(org,a.version+1,pv,state,statement_timestamp(),(q->>'effective_until')::timestamptz,(q->>'trial_end')::timestamptz,(q->>'grace_end')::timestamptz,
   coalesce(q->>'source','PLATFORM'),q->>'provider',q->>'provider_customer_ref',q->>'provider_subscription_ref',actor,reason,corr) returning id into eid;
  update app_private.saas_accounts set subscription_id=eid,version=a.version+1,status=state,
   activated_at=case when state in ('ACTIVE','TRIAL') then coalesce(activated_at,statement_timestamp()) else activated_at end,
   suspended_at=case when state='SUSPENDED' then statement_timestamp() else suspended_at end,
   closed_at=case when state='CANCELLED' then statement_timestamp() else closed_at end where organization_id=org and version=a.version;
 elsif op='PERIOD' then
  if exists(select 1 from jsonb_object_keys(q) k where k not in ('type','start','end','source')) then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
  insert into app_private.saas_usage_periods(organization_id,period_start,period_end,source,actor,reason)
   values(org,(q->>'start')::timestamptz,(q->>'end')::timestamptz,coalesce(q->>'source','PLATFORM'),actor,reason) returning id into eid;
 elsif op='REBUILD_USAGE' then
  if q<>jsonb_build_object('type',op) then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
  delete from app_private.saas_usage_counters where organization_id=org;
  insert into app_private.saas_usage_counters(organization_id,period_id,category,quantity)
   select org,period_id,category,sum(quantity) from app_private.saas_usage_events where organization_id=org group by period_id,category;
 else raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 insert into public.audit_events(organization_id,action,entity_type,entity_id,reason,correlation_id,metadata)
 values(org,'saas.'||lower(op),'saas_account',org,reason,corr,jsonb_build_object('platform_actor',actor,'previous',old,
 'current',app_private.saas_current(org),'plan_version_id',pv,'created_id',eid));
 return jsonb_build_object('data',jsonb_build_object('id',coalesce(eid,pv),'version',case when op='SUBSCRIPTION' then a.version+1 else v+1 end),'correlationId',corr);
end$$;
revoke all on function app_private.saas_control(uuid,jsonb,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.saas_control(uuid,jsonb,text,text,uuid) to elifora_saas_operator;

create function public.saas_snapshot(p_membership_id uuid,p_location_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ctx jsonb;org uuid;s jsonb;pv uuid;owner_access boolean;features jsonb;quotas jsonb:='[]';q record;used bigint;pid uuid;period jsonb;plan jsonb;begin
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,'saas.entitlements.read');if ctx ? 'code' then return ctx;end if;
 org:=(ctx->>'organization_id')::uuid;
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text||':saas',71));
 s:=app_private.saas_current(org);pv:=(s->>'plan_version_id')::uuid;
 owner_access:=exists(select 1 from public.salon_memberships where id=p_membership_id and user_id=auth.uid() and role_code='owner' and location_id is null and status='active');
 select jsonb_agg(jsonb_build_object('capability',cap,'configured',e.capability is not null,'enabled',coalesce(e.enabled,false),
  'creation_allowed',(s->>'creation_allowed')::boolean and coalesce(e.enabled,false),
  'reason',case when not (s->>'creation_allowed')::boolean then s->>'status' when e.enabled is distinct from true then 'FEATURE_NOT_INCLUDED' else null end) order by cap)
 into features from unnest(array['COLOR_ENGINE','BRAND_ADAPTER','LIVE_SESSION','CRM','STOCK','FINANCE','COSTING','COMMISSION','REPORTING','AI_GATEWAY']) cap
 left join app_private.saas_plan_entitlements e on e.plan_version_id=pv and e.capability=cap;
 if owner_access then
  select jsonb_build_object('id',p.id,'code',p.code,'label',p.label,'development_only',p.development_only,'version_id',v.id,'version',v.version)
   into plan from app_private.saas_plan_versions v join app_private.saas_plans p on p.id=v.plan_id where v.id=pv;
  select id,jsonb_build_object('id',id,'start',period_start,'end',period_end) into pid,period from app_private.saas_usage_periods
   where organization_id=org and period_start<=statement_timestamp() and period_end>statement_timestamp();
  for q in select code from unnest(array['LOCATIONS','ACTIVE_MEMBERS','STORAGE_BYTES','ENGINE_EXECUTIONS']) code loop
   if q.code='LOCATIONS' then select count(*) into used from public.locations where organization_id=org and archived_at is null;
   elsif q.code='ACTIVE_MEMBERS' then select count(distinct user_id) into used from public.salon_memberships where organization_id=org and status in ('active','invited');
   elsif q.code='STORAGE_BYTES' or pid is null then used:=null;
   else select coalesce(sum(quantity),0) into used from app_private.saas_usage_events where organization_id=org and period_id=pid and category=q.code;end if;
   quotas:=quotas||jsonb_build_array((select jsonb_build_object('code',q.code,'configured',x.code is not null,'limit',x.limit_value::text,'used',used::text,
    'status',case when x.code is null or used is null then 'UNKNOWN' when x.limit_value is null then 'UNCAPPED' when used>x.limit_value then 'EXCEEDED' when used=x.limit_value then 'AT_LIMIT' else 'AVAILABLE' end)
    from (select q.code marker) seed left join app_private.saas_plan_quotas x on x.plan_version_id=pv and x.code=q.code));
  end loop;
 end if;
 return jsonb_build_object('data',jsonb_build_object('organization_id',org,'location_id',p_location_id,'version',(s->>'version')::bigint,
  'status',s->>'status','entitlements',features,'management_allowed',owner_access,'plan',plan,'subscription',case when owner_access then s end,
  'period',period,'quotas',quotas,'observed_at',statement_timestamp(),
  'diagnostics',case when owner_access then jsonb_build_object('provider_rejected',(select count(*) from app_private.saas_provider_results r join app_private.saas_provider_events e on e.id=r.event_id where e.organization_id=org and r.status='REJECTED'),
    'quota_rejections',(select count(*) from app_private.saas_rejections where organization_id=org and category='QUOTA'),
    'subscription_rejections',(select count(*) from app_private.saas_rejections where organization_id=org and category='SUBSCRIPTION'),
    'usage_projection_mismatch',exists(select 1 from app_private.saas_usage_events e left join app_private.saas_usage_counters c on c.organization_id=e.organization_id and c.period_id=e.period_id and c.category=e.category where e.organization_id=org group by e.period_id,e.category,c.quantity having sum(e.quantity) is distinct from c.quantity)) end));
end$$;
revoke all on function public.saas_snapshot(uuid,uuid) from public,anon,service_role;
grant execute on function public.saas_snapshot(uuid,uuid) to authenticated;
