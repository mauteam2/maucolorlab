-- Reception receives operational readiness only, never the technical Live payload.
delete from public.role_permissions where role_code='reception' and permission_code='live_session.view';
insert into public.permissions(code,description) values('salon.readiness.read','Read minimal appointment preparation status, not technical authority.');
insert into public.role_permissions(role_code,permission_code)
select code,'salon.readiness.read' from public.roles where code in ('owner','manager','colorist','assistant','reception');

create function app_private.appointment_readiness(p_membership uuid,p_location uuid,p_appointment uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ctx jsonb; a public.salon_appointments%rowtype; org uuid; required boolean; state text;
begin
 if auth.uid() is null then return jsonb_build_object('code','UNAUTHENTICATED');end if;
 if p_membership is null or p_location is null or p_appointment is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 -- A revoke that wins this row lock must be observed before any private lookup.
 perform 1 from public.salon_memberships where id=p_membership and user_id=auth.uid() for share;
 ctx:=app_private.hair_write_context(p_membership,p_location,'salon.readiness.read');
 if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 select s.* into a from public.salon_appointments s join public.clients c on c.id=s.client_id and c.organization_id=s.organization_id
 where s.id=p_appointment and s.organization_id=org and s.location_id=p_location and c.archived_at is null;
 if not found then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
 required:=a.colorlab_required or a.hair_passport_required or a.precheck_required;
 -- This is not a chemical assessment or a safety clearance. No technical DTO is built.
 state:=case when not required then 'NOT_REQUIRED'
 when not exists(select 1 from public.hair_passports h where h.organization_id=org and h.client_id=a.client_id and h.status='ACTIVE') then 'CONSULTATION_REQUIRED'
 else 'REVIEW_REQUIRED' end;
 return jsonb_build_object('data',jsonb_build_object('schema_version',1,'appointment_id',a.id,'appointment_version',a.version,
 'evaluated_at',statement_timestamp(),'preparation_status',state,'consultation_required',required,
 'strand_test_status',case when required then 'UNKNOWN' else 'NOT_REQUIRED' end,
 'allocated_minutes',a.scheduled_duration_minutes,'duration_source','APPOINTMENT_ALLOCATION','technical_clearance',false));
end $$;
revoke all on function app_private.appointment_readiness(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function app_private.appointment_readiness(uuid,uuid,uuid) to authenticated;
create function public.appointment_readiness(p_membership_id uuid,p_location_id uuid,p_appointment_id uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select app_private.appointment_readiness(p_membership_id,p_location_id,p_appointment_id);
$$;
revoke all on function public.appointment_readiness(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.appointment_readiness(uuid,uuid,uuid) to authenticated;
