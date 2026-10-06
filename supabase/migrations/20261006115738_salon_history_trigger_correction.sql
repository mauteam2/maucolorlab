-- Non-appointment records do not have status: check the trigger table first.
create or replace function app_private.salon_protect_history() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' or tg_table_name in ('salon_operation_versions','salon_appointment_live_links') then raise exception using errcode='23514',message='salon history immutable';end if;
 if new.organization_id<>old.organization_id or new.location_id is distinct from old.location_id or new.created_by<>old.created_by or new.created_at<>old.created_at then raise exception using errcode='23514',message='salon ownership immutable';end if;
 if new.version<>old.version+1 then raise exception using errcode='23514',message='salon version conflict';end if;
 if tg_table_name='salon_appointments' then
  if old.status in ('COMPLETED','CANCELLED','NO_SHOW') then raise exception using errcode='23514',message='appointment terminal history immutable';end if;
 end if;
 return new;
end $$;
