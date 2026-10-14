create table app_private.saas_expiry_observations(
 subscription_id uuid not null references app_private.saas_subscriptions(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null check(kind in ('TRIAL_ENDED','GRACE_ENDED','SUBSCRIPTION_ENDED')),
 effective_at timestamptz not null,observed_at timestamptz not null default statement_timestamp(),
 primary key(subscription_id,kind)
);
alter table app_private.saas_expiry_observations enable row level security;
revoke all on app_private.saas_expiry_observations from public,anon,authenticated,service_role;
create trigger saas_expiry_immutable before update or delete on app_private.saas_expiry_observations for each row execute function app_private.live_immutable();
create function app_private.saas_observe_expiry(org uuid) returns void language plpgsql security definer set search_path='' as $$
declare s app_private.saas_subscriptions%rowtype;kind text;deadline timestamptz;inserted integer;begin
 select h.* into s from app_private.saas_accounts a join app_private.saas_subscriptions h on h.id=a.subscription_id where a.organization_id=org;
 if not found then return;end if;
 if s.status='TRIAL' and s.trial_end<=statement_timestamp() then kind:='TRIAL_ENDED';deadline:=s.trial_end;
 elsif s.status='PAST_DUE' and s.grace_end<=statement_timestamp() then kind:='GRACE_ENDED';deadline:=s.grace_end;
 elsif s.effective_until<=statement_timestamp() then kind:='SUBSCRIPTION_ENDED';deadline:=s.effective_until;
 else return;end if;
 insert into app_private.saas_expiry_observations(subscription_id,organization_id,kind,effective_at) values(s.id,org,kind,deadline) on conflict do nothing;
 get diagnostics inserted=ROW_COUNT;
 if inserted=1 then
  insert into public.audit_events(organization_id,action,entity_type,entity_id,reason,metadata)
   values(org,'saas.'||lower(kind),'saas_account',org,'Configured server-authoritative deadline observed',jsonb_build_object('platform_actor','SERVER_CLOCK','subscription_id',s.id,'effective_at',deadline));
 end if;
end$$;
revoke all on function app_private.saas_observe_expiry(uuid) from public,anon,authenticated,service_role;
do $migration$ declare body text;begin
 body:=pg_get_functiondef('public.saas_snapshot(uuid,uuid)'::regprocedure);
 body:=replace(body,' s:=app_private.saas_current(org);',' perform app_private.saas_observe_expiry(org);'||chr(10)||' s:=app_private.saas_current(org);');execute body;
end $migration$;
