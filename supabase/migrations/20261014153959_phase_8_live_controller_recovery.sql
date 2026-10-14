-- Lost-controller recovery is a separate permission, never an offline command.
insert into public.permissions(code,description) values('live_session.recover','Recover lost Live controller with an explicit audited reason');
insert into public.role_permissions(role_code,permission_code)
 select code,'live_session.recover' from public.roles where code in ('owner','manager');

-- Existing-session recovery is safe even when new work is subscription-blocked.
-- Re-read the subscription under the same lifecycle lock and retain only state
-- and version in the recovery audit, without exposing billing/control-plane data.
create function app_private.live_recovery_subscription(org uuid,loc uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare state jsonb;
begin
 if auth.uid() is null or not app_private.user_has_permission(org,loc,'live_session.recover') then
  raise exception using errcode='42501',message='FORBIDDEN';
 end if;
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text||':saas',71));
 state:=app_private.saas_current(org);
 return jsonb_build_object('status',state->>'status','version',state->'version');
end $$;
revoke all on function app_private.live_recovery_subscription(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.live_recovery_subscription(uuid,uuid) to elifora_live_writer;

do $migration$
declare definition text;anchor text;
begin
 definition:=pg_get_functiondef('app_private.live_permission(text)'::regprocedure);
 anchor:='when t=''CREATE'' then';
 if position(anchor in definition)=0 then raise exception 'Live permission anchor absent';end if;
 execute replace(definition,anchor,'when t=''RECOVER_CONTROL'' then ''live_session.recover'' '||anchor);

 definition:=pg_get_functiondef('app_private.store_live_session(uuid,uuid,text,text,uuid)'::regprocedure);
 anchor:='if t not in (''NOTE'',''PHOTO'',''CHECKPOINT_RECORD'',''RISK_EVENT'',''USAGE'',''MATERIAL_RECONCILE'') and';
 if position(anchor in definition)=0 then raise exception 'Live controller anchor absent';end if;
 definition:=replace(definition,anchor,'if t not in (''NOTE'',''PHOTO'',''CHECKPOINT_RECORD'',''RISK_EVENT'',''USAGE'',''MATERIAL_RECONCILE'',''RECOVER_CONTROL'') and');

 anchor:='if t=''TRANSFER_CONTROL'' and';
 if position(anchor in definition)=0 then raise exception 'Live transfer anchor absent';end if;
 definition:=replace(definition,anchor,$guard$
 if t='RECOVER_CONTROL' then
  if nullif(trim(q->>'reason'),'') is null or char_length(q->>'reason')>2000 or
   (q->>'device_id')::uuid=old.controller_device_id and auth.uid()=old.controller_user_id then
   return app_private.client_error('LIVE_CONTROLLER_CONFLICT',p_correlation);
  end if;
  if (v-array['recordVersion','updatedAt','controllerUserId','controllerDeviceId','controlEpoch','deviations']) is distinct from
   (old.payload-array['recordVersion','updatedAt','controllerUserId','controllerDeviceId','controlEpoch','deviations']) or
   v->>'controllerUserId' is distinct from auth.uid()::text or v->>'controllerDeviceId' is distinct from q->>'device_id' or
   (v->>'controlEpoch')::bigint is distinct from old.control_epoch+1 or
   jsonb_typeof(v->'deviations') is distinct from 'array' or
   jsonb_array_length(v->'deviations')<>jsonb_array_length(old.payload->'deviations')+1 or
   (v->'deviations'-(jsonb_array_length(v->'deviations')-1)) is distinct from old.payload->'deviations' then
   return app_private.client_error('LIVE_RESULT_INVALID',p_correlation);
  end if;
  x:=v->'deviations'->-1;
  if x->>'type' is distinct from 'PROFESSIONAL_DECISION' or x->>'reason' is distinct from q->>'reason' or
   x->>'changedBy' is distinct from auth.uid()::text or x->>'at' is distinct from v->>'updatedAt' or
   x->'before' is distinct from jsonb_build_object('user',old.controller_user_id,'device',old.controller_device_id,'epoch',old.control_epoch) or
   x->'after' is distinct from jsonb_build_object('user',auth.uid(),'device',(q->>'device_id')::uuid,'epoch',old.control_epoch+1) then
   return app_private.client_error('LIVE_RESULT_INVALID',p_correlation);
  end if;
  -- Locks organization -> session row -> SaaS lifecycle. No active-work gate.
  snapshot:=app_private.live_recovery_subscription(org,p_location);
 end if;
 if t='TRANSFER_CONTROL' and
 $guard$);
 anchor:='jsonb_build_object(''record_version'',rv,''mutation_id'',q->>''mutation_id'',''device_id'',q->>''device_id''),p_correlation);';
 if position(anchor in definition)=0 then raise exception 'Live audit anchor absent';end if;
 definition:=replace(definition,anchor,$audit$
 jsonb_build_object('record_version',rv,'mutation_id',q->>'mutation_id','device_id',q->>'device_id') ||
 case when t='RECOVER_CONTROL' then jsonb_build_object(
  'previous_controller',jsonb_build_object('user_id',old.controller_user_id,'device_id',old.controller_device_id,'epoch',old.control_epoch),
  'new_controller',jsonb_build_object('user_id',auth.uid(),'device_id',q->>'device_id','epoch',v->'controlEpoch'),
  'reason',q->>'reason','recovered_at',v->>'updatedAt','subscription',snapshot)
 else '{}'::jsonb end,p_correlation);
 $audit$);
 execute definition;
end $migration$;
