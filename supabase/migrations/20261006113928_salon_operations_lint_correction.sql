-- Forward correction: explicit variables, JSON casts and non-shadowed loop variables.

create or replace function app_private.salon_booking_check(org uuid,loc uuid,client_id uuid,service_id uuid,member_id uuid,a timestamptz,duration integer,ignore_id uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare svc public.salon_services%rowtype;worker public.salon_staff%rowtype;tz text;staff_user uuid;b timestamptz;occupied_a timestamptz;occupied_b timestamptz;local_a timestamp;local_b timestamp;day_date date;day_number integer;opening integer;closing integer;is_closed boolean;req record;res record;need integer;available integer;take integer;allocs jsonb:='[]'::jsonb;
begin
 select * into svc from public.salon_services s where s.id=salon_booking_check.service_id and s.organization_id=org and (s.location_id is null or s.location_id=loc) and s.active;
 if not found then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
 if duration not between 5 and 720 then return jsonb_build_object('code','INVALID_DURATION');end if;
 if not exists(select 1 from public.clients c where c.id=salon_booking_check.client_id and c.organization_id=org and c.status='ACTIVE') then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
 select l.timezone into tz from public.locations l where l.id=loc and l.organization_id=org and l.archived_at is null;
 select * into worker from public.salon_staff s where s.membership_id=member_id and s.organization_id=org and s.location_id=loc and s.active and s.bookable;
 select m.user_id into staff_user from public.salon_memberships m where m.id=member_id and m.organization_id=org and (m.location_id is null or m.location_id=loc) and m.status='active';
 if worker.membership_id is null or staff_user is null or not exists(select 1 from public.salon_service_staff e where e.service_id=salon_booking_check.service_id and e.membership_id=member_id and e.organization_id=org) then return jsonb_build_object('code','STAFF_NOT_ELIGIBLE');end if;
 if exists(select 1 from public.salon_service_capabilities c left join public.salon_competencies sc on sc.membership_id=member_id and sc.location_id=loc and sc.code=c.code where c.service_id=salon_booking_check.service_id and coalesce(app_private.salon_rank(sc.level),0)<app_private.salon_rank(c.level)) then return jsonb_build_object('code','TECHNICAL_ESCALATION');end if;
 b:=a+duration*interval '1 minute';occupied_a:=a-svc.buffer_before_minutes*interval '1 minute';occupied_b:=b+svc.buffer_after_minutes*interval '1 minute';local_a:=occupied_a at time zone tz;local_b:=occupied_b at time zone tz;day_date:=local_a::date;day_number:=extract(isodow from local_a)::integer;
 select x.closed,x.opens,x.closes into is_closed,opening,closing from public.salon_date_exceptions x where x.organization_id=org and x.location_id=loc and x.date=day_date and x.active;
 if not found then select w.closed,w.opens,w.closes into is_closed,opening,closing from public.salon_weekly_hours w where w.organization_id=org and w.location_id=loc and w.day=day_number;end if;
 if is_closed is distinct from false then return jsonb_build_object('code','LOCATION_CLOSED');end if;
 if local_b>day_date+interval '1 day' or local_a<day_date+opening*interval '1 minute' or local_b>day_date+closing*interval '1 minute' then return jsonb_build_object('code','OUTSIDE_WORKING_HOURS');end if;
 if exists(select 1 from public.salon_availability av where av.organization_id=org and av.location_id=loc and av.membership_id=member_id and av.active and av.type in ('BREAK','LEAVE','UNAVAILABLE') and tstzrange(av.starts_at,av.ends_at,'[)') && tstzrange(occupied_a,occupied_b,'[)')) then return jsonb_build_object('code','STAFF_UNAVAILABLE');end if;
 if exists(select 1 from public.salon_availability av where av.organization_id=org and av.location_id=loc and av.membership_id=member_id and av.active and av.type='SHIFT' and (av.starts_at at time zone tz)::date=day_date) then
  if not exists(select 1 from public.salon_availability av where av.organization_id=org and av.location_id=loc and av.membership_id=member_id and av.active and av.type='SHIFT' and av.starts_at<=occupied_a and av.ends_at>=occupied_b) then return jsonb_build_object('code','STAFF_UNAVAILABLE');end if;
 elsif not exists(select 1 from public.salon_staff_weekly w where w.organization_id=org and w.location_id=loc and w.membership_id=member_id and w.day=day_number and w.type='SHIFT' and local_a>=day_date+w.starts*interval '1 minute' and local_b<=day_date+w.ends*interval '1 minute') then return jsonb_build_object('code','STAFF_UNAVAILABLE');end if;
 if exists(select 1 from public.salon_staff_weekly w where w.organization_id=org and w.location_id=loc and w.membership_id=member_id and w.day=day_number and w.type='BREAK' and tsrange(day_date+w.starts*interval '1 minute',day_date+w.ends*interval '1 minute','[)') && tsrange(local_a,local_b,'[)')) then return jsonb_build_object('code','STAFF_UNAVAILABLE');end if;
 if exists(select 1 from public.salon_appointments ap where ap.organization_id=org and ap.staff_user_id=staff_user and ap.id is distinct from ignore_id and ap.status in ('DRAFT','CONFIRMED','ARRIVED','IN_SERVICE') and ap.occupied_during && tstzrange(occupied_a,occupied_b,'[)')) then return jsonb_build_object('code','STAFF_DOUBLE_BOOKED');end if;
 for req in select sr.type,sr.units from public.salon_service_requirements sr where sr.service_id=salon_booking_check.service_id order by sr.type loop
  need:=req.units;
  for res in select r.id,r.capacity from public.salon_resources r where r.organization_id=org and r.location_id=loc and r.type=req.type and r.active order by r.id loop
   available:=greatest(0,res.capacity-app_private.salon_resource_peak(res.id,occupied_a,occupied_b,ignore_id));take:=least(need,available);
   if take>0 then allocs:=allocs||jsonb_build_array(jsonb_build_object('resource_id',res.id,'units',take));need:=need-take;end if;
   exit when need=0;
  end loop;
  if need>0 then return jsonb_build_object('code','RESOURCE_UNAVAILABLE');end if;
 end loop;
 return jsonb_build_object('start_at',a,'end_at',b,'occupied_start_at',occupied_a,'occupied_end_at',occupied_b,'resources',allocs,'staff_user_id',staff_user,'timezone',tz);
end $$;

create or replace function app_private.salon_operation(p_membership uuid,p_location uuid,q jsonb,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;actor uuid:=auth.uid();t text:=q->>'type';permission text;allowed text[];d jsonb;item jsonb;entity uuid;expected bigint;v bigint;mid uuid;member uuid;current jsonb;response jsonb;receipt app_private.salon_receipts%rowtype;stamp timestamptz:=statement_timestamp();svc public.salon_services%rowtype;ap public.salon_appointments%rowtype;tz text;currency text;a timestamptz;duration integer;check_result jsonb;
begin
 permission:=case when t in ('CATEGORY_SAVE','SERVICE_SAVE') then 'salon.catalog.manage' when t in ('STAFF_SAVE','AVAILABILITY_SAVE') then 'salon.staff.manage' when t in ('HOURS_SAVE','EXCEPTION_SAVE') then 'salon.hours.manage' when t='RESOURCE_SAVE' then 'salon.resources.manage' when t in ('APPOINTMENT_SAVE','APPOINTMENT_TRANSITION','LINK_LIVE_SESSION') then 'salon.appointments.manage' end;
 if permission is null or actor is null or p_correlation is null or pg_column_size(q)>65536 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(p_membership,p_location,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 -- All new operations take the same organization lock: simultaneous staff/resource reservations cannot both pass.
 perform 1 from public.organizations where id=org for update;
 ctx:=app_private.hair_write_context(p_membership,p_location,permission);if ctx ? 'code' then return ctx;end if;
 allowed:=case t when 'CATEGORY_SAVE' then array['type','mutation_id','code','label','expected_version'] when 'STAFF_SAVE' then array['type','mutation_id','membership_id','expected_version','definition'] when 'HOURS_SAVE' then array['type','mutation_id','expected_version','days'] when 'EXCEPTION_SAVE' then array['type','mutation_id','id','expected_version','date','reason','active','closed','opens','closes'] when 'AVAILABILITY_SAVE' then array['type','mutation_id','id','expected_version','membership_id','type_of_absence','starts_at','ends_at','reason','active'] when 'APPOINTMENT_TRANSITION' then array['type','mutation_id','id','expected_version','status','reason'] when 'LINK_LIVE_SESSION' then array['type','mutation_id','id','expected_version','live_session_id'] else array['type','mutation_id','id','expected_version','definition'] end;
 if not app_private.salon_keys(q,allowed) or jsonb_typeof(q->'expected_version')<>'number' or jsonb_typeof(q->'mutation_id')<>'string' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 mid:=(q->>'mutation_id')::uuid;expected:=(q->>'expected_version')::bigint;if expected<0 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select * into receipt from app_private.salon_receipts r where r.organization_id=org and r.actor_id=actor and r.mutation_id=mid;
 if found then if receipt.location_id<>p_location or receipt.input<>q then return jsonb_build_object('code','SALON_CONFLICT');end if;return receipt.response;end if;
 select l.timezone,o.base_currency into tz,currency from public.locations l join public.organizations o on o.id=l.organization_id where l.id=p_location and l.organization_id=org;
 d:=q->'definition';entity:=case when t='HOURS_SAVE' then p_location when t='STAFF_SAVE' then (q->>'membership_id')::uuid when t='CATEGORY_SAVE' then null else (q->>'id')::uuid end;

 if t='CATEGORY_SAVE' then
  if jsonb_typeof(q->'code')<>'string' or jsonb_typeof(q->'label')<>'string' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  select c.version,c.id into v,entity from public.salon_categories c where c.organization_id=org and c.code=q->>'code';
  if coalesce(v,0)<>expected then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if v is null and (select count(*) from public.salon_categories where organization_id=org)>=56 then return jsonb_build_object('code','SALON_LIMIT_REACHED');end if;
  entity:=coalesce(entity,gen_random_uuid());v:=coalesce(v,0)+1;
  insert into public.salon_categories(id,organization_id,code,label,version) values(entity,org,q->>'code',trim(q->>'label'),v) on conflict(organization_id,code) do update set label=excluded.label,version=excluded.version;
  response:=jsonb_build_object('id',entity,'version',v);
 elsif t='SERVICE_SAVE' then
  if not app_private.salon_keys(d,array['name','category','description','organization_wide','base_duration_minutes','buffer_before_minutes','buffer_after_minutes','base_price','tax_rate','tax_inclusive','requires_colorlab','requires_hair_passport','requires_precheck','active','eligible_membership_ids','capabilities','resources']) or not app_private.salon_types(d,'{"name":"string","category":"string","description":"string|null","organization_wide":"boolean","base_duration_minutes":"number","buffer_before_minutes":"number","buffer_after_minutes":"number","base_price":"number","tax_rate":"number","tax_inclusive":"boolean","requires_colorlab":"boolean","requires_hair_passport":"boolean","requires_precheck":"boolean","active":"boolean","eligible_membership_ids":"array","capabilities":"array","resources":"array"}') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  if round((d->>'base_price')::numeric,2)<>(d->>'base_price')::numeric or round((d->>'tax_rate')::numeric,2)<>(d->>'tax_rate')::numeric then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  select * into svc from public.salon_services s where s.id=entity and s.organization_id=org and (s.location_id is null or s.location_id=p_location);
  v:=svc.version;if coalesce(v,0)<>expected or (v is null and exists(select 1 from public.salon_services where id=entity)) then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if v is null and (select count(*) from public.salon_services where organization_id=org)>=200 then return jsonb_build_object('code','SALON_LIMIT_REACHED');end if;
  if v is not null and (svc.location_id is null)<>(d->>'organization_wide')::boolean then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if jsonb_array_length(d->'eligible_membership_ids')>200 or jsonb_array_length(d->'capabilities')>7 or jsonb_array_length(d->'resources')>5 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  if not exists(select 1 from public.salon_categories where organization_id=org and code=d->>'category') then
   if d->>'category' not in ('COLOR','BLONDING','CORRECTION','TONING','CUT','CARE','STYLING','OTHER') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   insert into public.salon_categories(organization_id,code,label,version) values(org,d->>'category',case d->>'category' when 'COLOR' then 'Renklendirme' when 'BLONDING' then 'Açma' when 'CORRECTION' then 'Renk düzeltme' when 'TONING' then 'Tonlama' when 'CUT' then 'Saç kesimi' when 'CARE' then 'Bakım' when 'STYLING' then 'Şekillendirme' else 'Diğer' end,1);
  end if;
  v:=coalesce(v,0)+1;
  insert into public.salon_services(id,organization_id,location_id,name,category,description,base_duration_minutes,buffer_before_minutes,buffer_after_minutes,base_price,tax_rate,tax_inclusive,currency,requires_colorlab,requires_hair_passport,requires_precheck,active,version,created_at,updated_at,created_by,updated_by)
  values(entity,org,case when (d->>'organization_wide')::boolean then null else p_location end,trim(d->>'name'),d->>'category',d->>'description',(d->>'base_duration_minutes')::integer,(d->>'buffer_before_minutes')::integer,(d->>'buffer_after_minutes')::integer,(d->>'base_price')::numeric,(d->>'tax_rate')::numeric,(d->>'tax_inclusive')::boolean,currency,(d->>'requires_colorlab')::boolean,(d->>'requires_hair_passport')::boolean,(d->>'requires_precheck')::boolean,(d->>'active')::boolean,v,stamp,stamp,actor,actor)
  on conflict(id) do update set name=excluded.name,category=excluded.category,description=excluded.description,base_duration_minutes=excluded.base_duration_minutes,buffer_before_minutes=excluded.buffer_before_minutes,buffer_after_minutes=excluded.buffer_after_minutes,base_price=excluded.base_price,tax_rate=excluded.tax_rate,tax_inclusive=excluded.tax_inclusive,requires_colorlab=excluded.requires_colorlab,requires_hair_passport=excluded.requires_hair_passport,requires_precheck=excluded.requires_precheck,active=excluded.active,version=excluded.version,updated_at=stamp,updated_by=actor;
  delete from public.salon_service_staff where service_id=entity;delete from public.salon_service_capabilities where service_id=entity;delete from public.salon_service_requirements where service_id=entity;
  for item in select value from jsonb_array_elements(d->'eligible_membership_ids') loop
   member:=(item#>>'{}')::uuid;
   if not exists(select 1 from public.salon_memberships m where m.id=member and m.organization_id=org and m.status='active' and ((d->>'organization_wide')::boolean or m.location_id is null or m.location_id=p_location)) then raise exception using errcode='23514',message='ineligible membership';end if;
   insert into public.salon_service_staff values(org,entity,member);
  end loop;
  for item in select value from jsonb_array_elements(d->'capabilities') loop
   if not app_private.salon_keys(item,array['code','level']) then raise exception using errcode='23514',message='invalid capability';end if;
   insert into public.salon_service_capabilities values(org,entity,item->>'code',item->>'level');
  end loop;
  for item in select value from jsonb_array_elements(d->'resources') loop
   if not app_private.salon_keys(item,array['type','units']) or jsonb_typeof(item->'units')<>'number' then raise exception using errcode='23514',message='invalid requirement';end if;
   insert into public.salon_service_requirements values(org,entity,item->>'type',(item->>'units')::integer);
  end loop;
  response:=jsonb_build_object('id',entity,'version',v);
 elsif t='STAFF_SAVE' then
  if not app_private.salon_keys(d,array['display_name','active','bookable','working_capacity','notes','competencies','shifts']) or not app_private.salon_types(d,'{"display_name":"string","active":"boolean","bookable":"boolean","working_capacity":"number|null","notes":"string|null","competencies":"array","shifts":"array"}') or jsonb_array_length(d->'competencies')>7 or jsonb_array_length(d->'shifts')>42 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  if not exists(select 1 from public.salon_memberships m where m.id=entity and m.organization_id=org and (m.location_id is null or m.location_id=p_location) and m.status='active') then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
  select s.version into v from public.salon_staff s where s.membership_id=entity and s.location_id=p_location and s.organization_id=org;
  if coalesce(v,0)<>expected then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if v is null and (select count(*) from public.salon_staff where organization_id=org and location_id=p_location)>=200 then return jsonb_build_object('code','SALON_LIMIT_REACHED');end if;
  v:=coalesce(v,0)+1;
  insert into public.salon_staff values(entity,org,p_location,p_location,trim(d->>'display_name'),(d->>'active')::boolean,(d->>'bookable')::boolean,(d->>'working_capacity')::integer,d->>'notes',v,stamp,stamp,actor,actor)
  on conflict(membership_id,location_id) do update set display_name=excluded.display_name,active=excluded.active,bookable=excluded.bookable,working_capacity=excluded.working_capacity,notes=excluded.notes,version=excluded.version,updated_at=stamp,updated_by=actor;
  delete from public.salon_competencies where membership_id=entity and location_id=p_location;delete from public.salon_staff_weekly where membership_id=entity and location_id=p_location;
  for item in select value from jsonb_array_elements(d->'competencies') loop
   if not app_private.salon_keys(item,array['code','level']) then raise exception using errcode='23514',message='invalid competency';end if;
   insert into public.salon_competencies values(org,p_location,entity,item->>'code',item->>'level');
  end loop;
  for item in select value from jsonb_array_elements(d->'shifts') loop
   if not app_private.salon_keys(item,array['day','type','starts','ends']) or not app_private.salon_types(item,'{"day":"number","type":"string","starts":"number","ends":"number"}') then raise exception using errcode='23514',message='invalid shift';end if;
   insert into public.salon_staff_weekly values(org,p_location,entity,(item->>'day')::integer,item->>'type',(item->>'starts')::integer,(item->>'ends')::integer);
  end loop;
  response:=jsonb_build_object('id',entity,'version',v);
 elsif t='HOURS_SAVE' then
  select h.version into v from public.salon_hours h where h.location_id=p_location and h.organization_id=org;
  if coalesce(v,0)<>expected then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if jsonb_typeof(q->'days')<>'array' or jsonb_array_length(q->'days')<>7 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  v:=coalesce(v,0)+1;
  insert into public.salon_hours values(org,p_location,v,stamp,actor) on conflict(location_id) do update set version=excluded.version,updated_at=stamp,updated_by=actor;
  delete from public.salon_weekly_hours where location_id=p_location;
  for item in select value from jsonb_array_elements(q->'days') loop
   if not app_private.salon_keys(item,array['day','closed','opens','closes']) or not app_private.salon_types(item,'{"day":"number","closed":"boolean","opens":"number|null","closes":"number|null"}') then raise exception using errcode='23514',message='invalid opening hours';end if;
   insert into public.salon_weekly_hours values(org,p_location,(item->>'day')::integer,(item->>'closed')::boolean,(item->>'opens')::integer,(item->>'closes')::integer);
  end loop;
  response:=jsonb_build_object('id',entity,'version',v);
 elsif t='EXCEPTION_SAVE' then
  if not app_private.salon_types(q,'{"date":"string","reason":"string","active":"boolean","closed":"boolean","opens":"number|null","closes":"number|null"}') or q->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  select x.version into v from public.salon_date_exceptions x where x.id=entity and x.organization_id=org and x.location_id=p_location;
  if coalesce(v,0)<>expected or (v is null and exists(select 1 from public.salon_date_exceptions where id=entity)) then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if v is null and (select count(*) from public.salon_date_exceptions where location_id=p_location)>=400 then return jsonb_build_object('code','SALON_LIMIT_REACHED');end if;
  v:=coalesce(v,0)+1;
  insert into public.salon_date_exceptions values(entity,org,p_location,(q->>'date')::date,trim(q->>'reason'),(q->>'active')::boolean,(q->>'closed')::boolean,(q->>'opens')::integer,(q->>'closes')::integer,v,stamp,stamp,actor,actor)
  on conflict(id) do update set date=excluded.date,reason=excluded.reason,active=excluded.active,closed=excluded.closed,opens=excluded.opens,closes=excluded.closes,version=excluded.version,updated_at=stamp,updated_by=actor;
  response:=jsonb_build_object('id',entity,'version',v);
 elsif t='AVAILABILITY_SAVE' then
  member:=(q->>'membership_id')::uuid;
  if not exists(select 1 from public.salon_staff s where s.membership_id=member and s.organization_id=org and s.location_id=p_location) then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
  select x.version,to_jsonb(x) into v,current from public.salon_availability x where x.id=entity and x.organization_id=org and x.location_id=p_location;
  if coalesce(v,0)<>expected or (v is not null and (current->>'membership_id')::uuid<>member) or (v is null and exists(select 1 from public.salon_availability where id=entity)) then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if v is null and (select count(*) from public.salon_availability where location_id=p_location)>=400 then return jsonb_build_object('code','SALON_LIMIT_REACHED');end if;
  if not app_private.salon_types(q,'{"type_of_absence":"string","starts_at":"string","ends_at":"string","reason":"string","active":"boolean"}') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  v:=coalesce(v,0)+1;
  insert into public.salon_availability values(entity,org,p_location,member,q->>'type_of_absence',(q->>'starts_at')::timestamptz,(q->>'ends_at')::timestamptz,trim(q->>'reason'),(q->>'active')::boolean,v,stamp,stamp,actor,actor)
  on conflict(id) do update set type=excluded.type,starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason,active=excluded.active,version=excluded.version,updated_at=stamp,updated_by=actor;
  response:=jsonb_build_object('id',entity,'version',v);
 elsif t='RESOURCE_SAVE' then
  if not app_private.salon_keys(d,array['name','type','capacity','active']) or not app_private.salon_types(d,'{"name":"string","type":"string","capacity":"number","active":"boolean"}') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  select r.version,to_jsonb(r) into v,current from public.salon_resources r where r.id=entity and r.organization_id=org and r.location_id=p_location;
  if coalesce(v,0)<>expected or (v is null and exists(select 1 from public.salon_resources where id=entity)) then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if v is null and (select count(*) from public.salon_resources where location_id=p_location)>=100 then return jsonb_build_object('code','SALON_LIMIT_REACHED');end if;
  if v is not null and ((current->>'type')<>d->>'type' or not (d->>'active')::boolean or (d->>'capacity')::integer<(current->>'capacity')::integer) and exists(select 1 from public.salon_appointment_resources ar join public.salon_appointments a on a.id=ar.appointment_id where ar.resource_id=entity and a.status in ('DRAFT','CONFIRMED','ARRIVED','IN_SERVICE') and a.occupied_end_at>=stamp) then return jsonb_build_object('code','RESOURCE_HAS_BOOKINGS');end if;
  v:=coalesce(v,0)+1;
  insert into public.salon_resources values(entity,org,p_location,trim(d->>'name'),d->>'type',(d->>'capacity')::integer,(d->>'active')::boolean,v,stamp,stamp,actor,actor)
  on conflict(id) do update set name=excluded.name,type=excluded.type,capacity=excluded.capacity,active=excluded.active,version=excluded.version,updated_at=stamp,updated_by=actor;
  response:=jsonb_build_object('id',entity,'version',v);
 else
  select * into ap from public.salon_appointments a where a.id=entity and a.organization_id=org and a.location_id=p_location;
  v:=ap.version;
  if coalesce(v,0)<>expected or (v is null and t<>'APPOINTMENT_SAVE') or (v is null and exists(select 1 from public.salon_appointments where id=entity)) then return jsonb_build_object('code','SALON_CONFLICT');end if;
  if ap.status in ('COMPLETED','CANCELLED','NO_SHOW') then return jsonb_build_object('code','APPOINTMENT_IMMUTABLE');end if;
  if t='APPOINTMENT_SAVE' then
   if v is not null and ap.status not in ('DRAFT','CONFIRMED') then return jsonb_build_object('code','INVALID_TRANSITION');end if;
   if not app_private.salon_keys(d,array['client_id','service_id','staff_membership_id','local_start','utc_offset_minutes','scheduled_duration_minutes','adjustment_reason','notes','status']) or not app_private.salon_types(d,'{"client_id":"string","service_id":"string","staff_membership_id":"string","local_start":"string","utc_offset_minutes":"number|null","scheduled_duration_minutes":"number|null","adjustment_reason":"string|null","notes":"string|null","status":"string"}') or d->>'status' not in ('DRAFT','CONFIRMED') or (ap.status='CONFIRMED' and d->>'status'='DRAFT') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
   select * into svc from public.salon_services s where s.id=(d->>'service_id')::uuid and s.organization_id=org and (s.location_id is null or s.location_id=p_location) and s.active;
   if not found then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
   duration:=coalesce((d->>'scheduled_duration_minutes')::integer,svc.base_duration_minutes);
   if duration<>svc.base_duration_minutes and (not app_private.user_has_permission(org,p_location,'salon.appointments.adjust_duration') or nullif(trim(d->>'adjustment_reason'),'') is null) then return jsonb_build_object('code','INVALID_DURATION');end if;
   a:=app_private.salon_local_instant(d->>'local_start',tz,(d->>'utc_offset_minutes')::integer);
   check_result:=app_private.salon_booking_check(org,p_location,(d->>'client_id')::uuid,svc.id,(d->>'staff_membership_id')::uuid,a,duration,case when v is not null then entity else null end);
   if check_result ? 'code' then return check_result;end if;
   v:=coalesce(v,0)+1;
   insert into public.salon_appointments(id,organization_id,location_id,client_id,service_id,service_name,service_version,staff_membership_id,staff_user_id,staff_display_name,start_at,end_at,occupied_start_at,occupied_end_at,timezone,status,default_duration_minutes,scheduled_duration_minutes,adjustment_reason,base_price,tax_rate,tax_inclusive,quoted_total,currency,buffer_before_minutes,buffer_after_minutes,colorlab_required,hair_passport_required,precheck_required,notes,version,created_at,updated_at,created_by,updated_by)
   values(entity,org,p_location,(d->>'client_id')::uuid,svc.id,svc.name,svc.version,(d->>'staff_membership_id')::uuid,(check_result->>'staff_user_id')::uuid,(select display_name from public.salon_staff where membership_id=(d->>'staff_membership_id')::uuid and location_id=p_location),a,(check_result->>'end_at')::timestamptz,(check_result->>'occupied_start_at')::timestamptz,(check_result->>'occupied_end_at')::timestamptz,tz,d->>'status',svc.base_duration_minutes,duration,case when duration<>svc.base_duration_minutes then d->>'adjustment_reason' else null end,svc.base_price,svc.tax_rate,svc.tax_inclusive,case when svc.tax_inclusive then svc.base_price else round(svc.base_price*(1+svc.tax_rate/100),2) end,currency,svc.buffer_before_minutes,svc.buffer_after_minutes,svc.requires_colorlab,svc.requires_hair_passport,svc.requires_precheck,d->>'notes',v,stamp,stamp,actor,actor)
   on conflict(id) do update set client_id=excluded.client_id,service_id=excluded.service_id,service_name=excluded.service_name,service_version=excluded.service_version,staff_membership_id=excluded.staff_membership_id,staff_user_id=excluded.staff_user_id,staff_display_name=excluded.staff_display_name,start_at=excluded.start_at,end_at=excluded.end_at,occupied_start_at=excluded.occupied_start_at,occupied_end_at=excluded.occupied_end_at,timezone=excluded.timezone,status=excluded.status,default_duration_minutes=excluded.default_duration_minutes,scheduled_duration_minutes=excluded.scheduled_duration_minutes,adjustment_reason=excluded.adjustment_reason,base_price=excluded.base_price,tax_rate=excluded.tax_rate,tax_inclusive=excluded.tax_inclusive,quoted_total=excluded.quoted_total,currency=excluded.currency,buffer_before_minutes=excluded.buffer_before_minutes,buffer_after_minutes=excluded.buffer_after_minutes,colorlab_required=excluded.colorlab_required,hair_passport_required=excluded.hair_passport_required,precheck_required=excluded.precheck_required,notes=excluded.notes,version=excluded.version,updated_at=stamp,updated_by=actor;
   delete from public.salon_appointment_resources where appointment_id=entity;
   for item in select value from jsonb_array_elements(check_result->'resources') loop insert into public.salon_appointment_resources values(org,p_location,(d->>'client_id')::uuid,entity,(item->>'resource_id')::uuid,(item->>'units')::integer);end loop;
  elsif t='APPOINTMENT_TRANSITION' then
   if jsonb_typeof(q->'reason')<>'string' or char_length(trim(q->>'reason')) not between 1 and 500 or not ((ap.status='DRAFT' and q->>'status' in ('CONFIRMED','CANCELLED')) or (ap.status='CONFIRMED' and q->>'status' in ('ARRIVED','CANCELLED','NO_SHOW')) or (ap.status='ARRIVED' and q->>'status' in ('IN_SERVICE','CANCELLED')) or (ap.status='IN_SERVICE' and q->>'status' in ('COMPLETED','CANCELLED'))) then return jsonb_build_object('code','INVALID_TRANSITION');end if;
   if q->>'status' in ('CONFIRMED','ARRIVED','IN_SERVICE') then
    if not exists(select 1 from public.salon_services s where s.id=ap.service_id and s.active and s.version=ap.service_version) then return jsonb_build_object('code','SALON_CONFLICT');end if;
    check_result:=app_private.salon_booking_check(org,p_location,ap.client_id,ap.service_id,ap.staff_membership_id,ap.start_at,ap.scheduled_duration_minutes,entity);if check_result ? 'code' then return check_result;end if;
   end if;
   v:=v+1;
   update public.salon_appointments set status=q->>'status',version=v,updated_at=stamp,updated_by=actor,cancelled_at=case when q->>'status'='CANCELLED' then stamp else cancelled_at end,arrived_at=case when q->>'status'='ARRIVED' then stamp else arrived_at end,started_at=case when q->>'status'='IN_SERVICE' then stamp else started_at end,completed_at=case when q->>'status'='COMPLETED' then stamp else completed_at end,actual_duration_seconds=case when q->>'status'='COMPLETED' then greatest(0,floor(extract(epoch from stamp-started_at)))::bigint else actual_duration_seconds end where id=entity;
  elsif t='LINK_LIVE_SESSION' then
   if ap.status<>'IN_SERVICE' then return jsonb_build_object('code','INVALID_TRANSITION');end if;
   if not app_private.user_has_permission(org,p_location,'live_session.view') or not exists(select 1 from public.live_sessions l where l.id=(q->>'live_session_id')::uuid and l.organization_id=org and l.location_id=p_location and l.client_id=ap.client_id) then return jsonb_build_object('code','SALON_NOT_FOUND');end if;
   if (select count(*) from public.salon_appointment_live_links where appointment_id=entity)>=25 then return jsonb_build_object('code','SALON_LIMIT_REACHED');end if;
   insert into public.salon_appointment_live_links values(org,p_location,ap.client_id,entity,(q->>'live_session_id')::uuid,actor,stamp);v:=v+1;
   update public.salon_appointments set version=v,updated_at=stamp,updated_by=actor where id=entity;
  end if;
  select app_private.salon_appointment_json(booked) into response from public.salon_appointments booked where booked.id=entity;
 end if;
 insert into public.salon_operation_versions(organization_id,location_id,entity_type,entity_id,version,actor_id,mutation_id,correlation_id,recorded_at,payload) values(org,p_location,lower(t),entity,v,actor,mid,p_correlation,stamp,jsonb_build_object('command',q,'result',response));
 insert into public.audit_events(actor_user_id,organization_id,location_id,action,entity_type,entity_id,reason,metadata,correlation_id) values(actor,org,p_location,'salon.'||lower(t),'salon_operations',entity,case when t in ('EXCEPTION_SAVE','AVAILABILITY_SAVE','APPOINTMENT_TRANSITION') then q->>'reason' else null end,jsonb_build_object('version',v,'mutation_id',mid),p_correlation);
 response:=jsonb_build_object('data',response);
 insert into app_private.salon_receipts values(org,p_location,actor,mid,q,response);
 return response;
exception when exclusion_violation then return jsonb_build_object('code','STAFF_DOUBLE_BOOKED');when unique_violation then return jsonb_build_object('code','SALON_CONFLICT');when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('code',case when sqlerrm in ('AMBIGUOUS_LOCAL_TIME','INVALID_LOCAL_TIME') then sqlerrm else 'INVALID_LOCAL_TIME' end);when check_violation or invalid_text_representation or numeric_value_out_of_range or not_null_violation or foreign_key_violation then return jsonb_build_object('code','VALIDATION_FAILED');
end $$;

create or replace function app_private.salon_slots(p_membership uuid,p_location uuid,q jsonb) returns jsonb language plpgsql stable security definer set search_path='' set row_security='on' as $$
declare ctx jsonb;org uuid;tz text;svc public.salon_services%rowtype;d date;finish date;duration integer;n integer:=0;limit_n integer;slots jsonb:='[]'::jsonb;a timestamptz;checked jsonb;begin
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
  for minute in 0..95 loop
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
