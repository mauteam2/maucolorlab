create table app_private.saas_structure_receipts(
 organization_id uuid not null references public.organizations(id) on delete cascade,actor_id uuid not null,
 request_id uuid not null,input jsonb not null,source_id uuid not null,created_at timestamptz not null default statement_timestamp(),
 primary key(organization_id,actor_id,request_id)
);
alter table app_private.saas_structure_receipts enable row level security;
revoke all on app_private.saas_structure_receipts from public,anon,authenticated,service_role;
create trigger saas_structure_receipt_immutable before update or delete on app_private.saas_structure_receipts for each row execute function app_private.live_immutable();

create function public.saas_structure_operation(p_membership_id uuid,p_location_id uuid,p_command jsonb,p_correlation_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ctx jsonb;org uuid;op text:=p_command->>'type';q jsonb:=p_command;permission text;rid uuid;eid uuid;receipt app_private.saas_structure_receipts%rowtype;code text;begin
 permission:=case op when 'CREATE_MEMBER' then 'memberships.manage' when 'CREATE_LOCATION' then 'location.manage' end;
 if permission is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,permission);if ctx ? 'code' then return ctx;end if;
 if not exists(select 1 from public.salon_memberships where id=p_membership_id and user_id=auth.uid() and status='active' and role_code='owner' and location_id is null)
  or not app_private.user_has_permission(org,null,permission) then return jsonb_build_object('code','FORBIDDEN');end if;
 if p_correlation_id is null or jsonb_typeof(q)<>'object' or pg_column_size(q)>4096 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if op='CREATE_MEMBER' and not app_private.salon_keys(q,array['type','request_id','id','user_id','role','location_id'])
  or op='CREATE_LOCATION' and not app_private.salon_keys(q,array['type','request_id','id','name','timezone']) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 rid:=(q->>'request_id')::uuid;eid:=(q->>'id')::uuid;
 select * into receipt from app_private.saas_structure_receipts where organization_id=org and actor_id=auth.uid() and request_id=rid;
 if found then if receipt.input<>q then return jsonb_build_object('code','SAAS_VERSION_CONFLICT');end if;return jsonb_build_object('data',jsonb_build_object('id',receipt.source_id),'correlationId',p_correlation_id);end if;
 begin
  if op='CREATE_MEMBER' then
   if q->>'role' not in ('owner','manager','colorist','assistant','reception') or jsonb_typeof(q->'location_id') not in ('string','null') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   insert into public.salon_memberships(id,organization_id,user_id,location_id,role_code,status,created_by)
    values(eid,org,(q->>'user_id')::uuid,(q->>'location_id')::uuid,q->>'role','invited',auth.uid());
  else
   if not exists(select 1 from pg_timezone_names where name=q->>'timezone') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   insert into public.locations(id,organization_id,name,timezone) values(eid,org,q->>'name',q->>'timezone');
  end if;
  insert into app_private.saas_structure_receipts(organization_id,actor_id,request_id,input,source_id) values(org,auth.uid(),rid,q,eid);
  insert into public.audit_events(actor_user_id,organization_id,action,entity_type,entity_id,correlation_id,metadata)
   values(auth.uid(),org,'saas.'||lower(op),case when op='CREATE_MEMBER' then 'salon_memberships' else 'locations' end,eid,p_correlation_id,jsonb_build_object('request_id',rid));
 exception when raise_exception then
  get stacked diagnostics code=MESSAGE_TEXT;
  if code not in ('SUBSCRIPTION_RESTRICTED','QUOTA_UNKNOWN','QUOTA_EXCEEDED','USAGE_PERIOD_UNKNOWN') then raise;end if;
  insert into app_private.saas_rejections(organization_id,category,code,correlation_id)
   values(org,case when code='SUBSCRIPTION_RESTRICTED' then 'SUBSCRIPTION' else 'QUOTA' end,code,p_correlation_id) on conflict(correlation_id) do nothing;
  return jsonb_build_object('code',code);
 end;
 return jsonb_build_object('data',jsonb_build_object('id',eid),'correlationId',p_correlation_id);
exception when invalid_text_representation or not_null_violation or check_violation or foreign_key_violation then return jsonb_build_object('code','VALIDATION_FAILED');
 when unique_violation then return jsonb_build_object('code','SAAS_VERSION_CONFLICT');end$$;
revoke all on function public.saas_structure_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.saas_structure_operation(uuid,uuid,jsonb,uuid) to authenticated;

-- Successful engine usage is bound to the actual immutable DRAFT source, never
-- a browser-supplied usage count or a blocked safety evaluation.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.saas_record_usage(uuid,uuid,text,text,uuid,bigint,text)'::regprocedure);
 body:=replace(body,'declare old app_private.saas_usage_events%rowtype;pid uuid;begin',
  'declare old app_private.saas_usage_events%rowtype;pid uuid;plan public.color_plans%rowtype;begin
 if category=''ENGINE_EXECUTIONS'' then
  select * into plan from public.color_plans where organization_id=org and location_id=loc and id=source and status=''DRAFT'';
  if not found or domain<>''COLOR_PLAN'' or amount<>1 or hash<>encode(extensions.digest(convert_to(plan.id::text||'':''||plan.request_id::text||'':''||plan.status,''UTF8''),''sha256''),''hex'') then
   raise exception using errcode=''P0001'',message=''USAGE_SOURCE_INVALID'';end if;
 end if;');
 execute body;
end $migration$;
