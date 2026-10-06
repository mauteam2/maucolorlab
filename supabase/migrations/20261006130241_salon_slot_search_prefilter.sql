-- Forward correction: bounded slot search prefilters impossible opening-hour candidates.
create or replace function app_private.salon_slots(p_membership uuid,p_location uuid,q jsonb) returns jsonb language plpgsql stable security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;tz text;svc public.salon_services%rowtype;d date;finish date;duration integer;n integer:=0;limit_n integer;slots jsonb:='[]'::jsonb;a timestamptz;checked jsonb;closed_day boolean;opening integer;closing integer;first_slot integer;last_slot integer;begin
 ctx:=app_private.hair_write_context(p_membership,p_location,'salon.read');if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 if not app_private.salon_keys(q,array['client_id','service_id','staff_membership_id','from_date','to_date','duration_minutes','limit']) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 d:=(q->>'from_date')::date;finish:=(q->>'to_date')::date;limit_n:=(q->>'limit')::integer;
 if finish<d or finish-d>6 or limit_n not between 1 and 20 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select s.* into svc from public.salon_services s where s.id=(q->>'service_id')::uuid and s.organization_id=org and (s.location_id is null or s.location_id=p_location) and s.active;
 if not found then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
 duration:=coalesce((q->>'duration_minutes')::integer,svc.base_duration_minutes);
 if duration not between 5 and 720 then return jsonb_build_object('code','INVALID_DURATION');end if;
 select timezone into tz from public.locations where id=p_location and organization_id=org;
 while d<=finish loop
  -- Skip times that cannot fit opening hours before expensive per-slot RLS and capacity checks.
  select e.closed,e.opens,e.closes into closed_day,opening,closing from public.salon_date_exceptions e where e.organization_id=org and e.location_id=p_location and e.date=d and e.active;
  if not found then select w.closed,w.opens,w.closes into closed_day,opening,closing from public.salon_weekly_hours w where w.organization_id=org and w.location_id=p_location and w.day=extract(isodow from d);end if;
  if not found or coalesce(closed_day,true) then d:=d+1;continue;end if;
  first_slot:=greatest(0,ceil((opening+svc.buffer_before_minutes)::numeric/15)::integer);
  last_slot:=least(95,floor((closing-duration-svc.buffer_after_minutes)::numeric/15)::integer);
  if first_slot>last_slot then d:=d+1;continue;end if;
  for minute in first_slot..last_slot loop
   n:=n+1;
   begin a:=app_private.salon_local_instant(to_char(d+minute*interval '15 minutes','YYYY-MM-DD"T"HH24:MI'),tz,null);
   exception when invalid_datetime_format then continue;end;
   checked:=app_private.salon_booking_check(org,p_location,(q->>'client_id')::uuid,svc.id,(q->>'staff_membership_id')::uuid,a,duration,null);
   if not checked ? 'code' then slots:=slots||jsonb_build_array(jsonb_build_object('start_at',a,'end_at',checked->'end_at','local_start',to_char(a at time zone tz,'YYYY-MM-DD"T"HH24:MI'),'utc_offset_minutes',extract(epoch from ((a at time zone tz)-(a at time zone 'UTC')))/60));end if;
   exit when jsonb_array_length(slots)>=limit_n;
  end loop;
  exit when jsonb_array_length(slots)>=limit_n;d:=d+1;
 end loop;
 return jsonb_build_object('data',jsonb_build_object('timezone',tz,'slots',slots,'candidates_checked',n,'truncated',jsonb_array_length(slots)>=limit_n));
exception when data_exception then return jsonb_build_object('code','VALIDATION_FAILED');
end $$;
