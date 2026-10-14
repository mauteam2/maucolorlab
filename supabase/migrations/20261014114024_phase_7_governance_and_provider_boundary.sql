-- Forward corrections from real database lint; no source permissions replaced.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.saas_record_usage(uuid,uuid,text,text,uuid,bigint,text)'::regprocedure);
 body:=replace(body,'on conflict(organization_id,period_id,category)','on conflict on constraint saas_usage_counters_pkey');execute body;
 body:=pg_get_functiondef('public.saas_snapshot(uuid,uuid)'::regprocedure);
 body:=replace(body,'quotas jsonb:=''[]'';','quotas jsonb:=''[]''::jsonb;');execute body;
 body:=pg_get_functiondef('app_private.saas_source_gate()'::regprocedure);
 body:=replace(body,'if auth.uid() is not null and not app_private.user_has_permission(org,loc,perm)',
  'if current_setting(''role'')=''authenticated'' and (auth.uid() is null or not app_private.user_has_permission(org,loc,perm))');execute body;
end $migration$;

create table app_private.saas_provider_links(
 provider text not null,customer_ref text not null,organization_id uuid not null references public.organizations(id) on delete cascade,
 actor text not null,reason text not null,created_at timestamptz not null default statement_timestamp(),
 primary key(provider,customer_ref),check(length(provider) between 1 and 80 and length(customer_ref) between 1 and 200)
);
alter table app_private.saas_provider_links enable row level security;
revoke all on app_private.saas_provider_links from public,anon,authenticated,service_role,elifora_saas_operator;
create trigger saas_provider_link_immutable before update or delete on app_private.saas_provider_links for each row execute function app_private.live_immutable();

create function app_private.saas_link_provider(org uuid,provider text,customer text,actor text,reason text,corr uuid) returns void
language plpgsql security definer set search_path='' as $$
declare previous_org uuid;begin
 if org is null or corr is null or length(actor) not between 1 and 160 or length(reason) not between 1 and 500 then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('saas-provider:'||provider||':'||customer,73));
 select organization_id into previous_org from app_private.saas_provider_links where saas_provider_links.provider=saas_link_provider.provider and customer_ref=customer;
 if found then if previous_org<>org then raise exception using errcode='P0001',message='PROVIDER_LINK_CONFLICT';end if;return;end if;
 insert into app_private.saas_provider_links values(provider,customer,org,actor,reason,statement_timestamp());
 insert into public.audit_events(organization_id,action,entity_type,entity_id,reason,correlation_id,metadata)
 values(org,'saas.provider_link','saas_account',org,reason,corr,jsonb_build_object('platform_actor',actor,'provider',provider,'customer_ref_hash',encode(extensions.digest(customer,'sha256'),'hex')));
end$$;
revoke all on function app_private.saas_link_provider(uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.saas_link_provider(uuid,text,text,text,uuid) to elifora_saas_operator;

-- Only a trusted server adapter/operator can invoke this private function.
-- Signature verification happens over raw bytes before this port is called.
-- There is no live or unsigned public webhook endpoint in this phase.
create function app_private.saas_provider_event(provider text,event_key text,customer text,payload_hash text,command jsonb,corr uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid;old app_private.saas_provider_events%rowtype;eid uuid;response jsonb;failure text;begin
 if corr is null or payload_hash !~ '^[a-f0-9]{64}$' or command->>'type'<>'SUBSCRIPTION' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
 perform pg_advisory_xact_lock(hashtextextended('saas-event:'||provider||':'||event_key,74));
 select * into old from app_private.saas_provider_events e where e.provider=saas_provider_event.provider and external_event_id=event_key;
 if found then
  if old.payload_hash<>saas_provider_event.payload_hash then
   insert into app_private.saas_rejections(organization_id,category,code,correlation_id) values(old.organization_id,'SUBSCRIPTION','PROVIDER_REPLAY_CONFLICT',corr) on conflict(correlation_id) do nothing;
   return jsonb_build_object('code','PROVIDER_REPLAY_CONFLICT');
  end if;
  return (select jsonb_build_object('data',jsonb_build_object('event_id',old.id,'status',status,'code',code,'subscription_id',subscription_id)) from app_private.saas_provider_results where event_id=old.id);
 end if;
 select organization_id into org from app_private.saas_provider_links p where p.provider=saas_provider_event.provider and customer_ref=customer;
 if org is null then return jsonb_build_object('code','PROVIDER_CUSTOMER_UNLINKED');end if;
 insert into app_private.saas_provider_events(organization_id,provider,external_event_id,payload_hash,verified)
  values(org,provider,event_key,payload_hash,true) returning id into eid;
 begin
  response:=app_private.saas_control(org,command||jsonb_build_object('source','PROVIDER','provider',provider,'provider_customer_ref',customer),
   'VERIFIED_PROVIDER:'||provider,'Verified provider event '||event_key,corr);
  insert into app_private.saas_provider_results(event_id,status,subscription_id) values(eid,'APPLIED',(response#>>'{data,id}')::uuid);
 exception when others then
  get stacked diagnostics failure=MESSAGE_TEXT;
  if failure not in ('SAAS_VERSION_CONFLICT','VALIDATION_FAILED') then failure:='PROVIDER_STATE_REJECTED';end if;
  insert into app_private.saas_provider_results(event_id,status,code) values(eid,'REJECTED',failure);
 end;
 return (select jsonb_build_object('data',jsonb_build_object('event_id',eid,'status',status,'code',code,'subscription_id',subscription_id)) from app_private.saas_provider_results where event_id=eid);
end$$;
revoke all on function app_private.saas_provider_event(text,text,text,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.saas_provider_event(text,text,text,text,jsonb,uuid) to elifora_saas_operator;

create function public.saas_operation(p_membership_id uuid,p_location_id uuid,p_command jsonb,p_correlation_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ctx jsonb;org uuid;q jsonb:=p_command;eid uuid;old app_private.saas_change_requests%rowtype;begin
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,'saas.subscription.manage');if ctx ? 'code' then return ctx;end if;
 if not exists(select 1 from public.salon_memberships where id=p_membership_id and user_id=auth.uid() and status='active' and role_code='owner' and location_id is null) then return jsonb_build_object('code','FORBIDDEN');end if;
 org:=(ctx->>'organization_id')::uuid;
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text,0));
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,'saas.subscription.manage');if ctx ? 'code' then return ctx;end if;
 if p_correlation_id is null or jsonb_typeof(q)<>'object' or pg_column_size(q)>4096 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q->>'type'='REQUEST_CHANGE' then
  if not app_private.salon_keys(q,array['type','request_id','reason']) or length(q->>'reason') not between 1 and 500 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text||':'||auth.uid()::text||':'||(q->>'request_id'),75));
  select * into old from app_private.saas_change_requests where organization_id=org and actor_user_id=auth.uid() and request_id=(q->>'request_id')::uuid;
  if found then if old.reason<>q->>'reason' then return jsonb_build_object('code','SAAS_VERSION_CONFLICT');end if;eid:=old.id;
  else
   insert into app_private.saas_change_requests(organization_id,actor_user_id,request_id,reason) values(org,auth.uid(),(q->>'request_id')::uuid,q->>'reason') returning id into eid;
   insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,reason,correlation_id)
    values(auth.uid(),org,'saas.change_requested','saas_account',org,q->>'reason',p_correlation_id);
  end if;
 elsif q=jsonb_build_object('type','REBUILD_USAGE') then
  perform app_private.saas_control(org,q,auth.uid()::text,'Owner requested deterministic usage rebuild',p_correlation_id);eid:=org;
 else return jsonb_build_object('code','VALIDATION_FAILED');end if;
 return jsonb_build_object('data',jsonb_build_object('id',eid),'correlationId',p_correlation_id);
exception when invalid_text_representation or not_null_violation then return jsonb_build_object('code','VALIDATION_FAILED');end$$;
revoke all on function public.saas_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.saas_operation(uuid,uuid,jsonb,uuid) to authenticated;

-- Gate only new future valuation policy work. Corrections to historical charges,
-- automatic cost/commission facts and safety material reconciliation remain free.
do $migration$ declare body text;anchor text;begin
 body:=pg_get_functiondef('public.costing_operation(uuid,uuid,jsonb,uuid)'::regprocedure);
 anchor:=' begin'||chr(10)||'  cc:=(select base_currency';
 if position(anchor in body)=0 then raise exception 'costing gate anchor missing';end if;
 body:=replace(body,anchor,' if op in (''INTAKE'',''SET_BASIS'') then perform app_private.saas_require(org,''COSTING'');end if;'||chr(10)||anchor);
 execute body;
end $migration$;
