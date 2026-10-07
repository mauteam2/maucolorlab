-- Bound option catalogs and keep service recency distinct from any-service recency.
create or replace function app_private.crm_read(p_membership uuid,p_location uuid,q jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security='on' set statement_timeout='5s' as $$
declare ctx jsonb;org uuid;op text:=q->>'operation';allowed text[];cid uuid;canonical uuid;ids uuid[];v_offset integer:=coalesce((q->>'offset')::integer,0);v_limit integer:=coalesce((q->>'limit')::integer,25);items jsonb;more boolean;next_offset integer;filter jsonb;needle text;fingerprint text;token uuid;source public.clients%rowtype;target public.clients%rowtype;sp jsonb;tp jsonb;data jsonb;
begin
 ctx:=app_private.hair_write_context(p_membership,p_location,case when op='merge_review' then 'crm.merge' else 'crm.read' end);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 allowed:=case when op='list' then array['operation','filter','offset','limit'] when op in ('timeline','appointments','notes','actions') then array['operation','client_id','offset','limit','status'] when op='merge_review' then array['operation','source_client_id','target_client_id'] when op='options' then array['operation'] else array['operation','client_id'] end;
 if not app_private.salon_keys(q,allowed) or op is null or op not in ('summary','list','timeline','appointments','notes','actions','duplicates','merge_review','options') or v_offset not between 0 and 10000 or v_limit not between 1 and 50 or pg_column_size(q)>8192 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if q ? 'client_id' then
 cid:=(q->>'client_id')::uuid;if not exists(select 1 from public.clients c where c.organization_id=org and c.id=cid) then return jsonb_build_object('code','CRM_NOT_FOUND');end if;
 ids:=app_private.crm_family(org,cid);canonical:=coalesce((select l.target_client_id from public.client_merge_links l where l.organization_id=org and l.source_client_id=cid),cid);
 end if;
 if op in ('summary','timeline','appointments','notes','duplicates') and cid is null then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if op='summary' then
 data:=jsonb_build_object('summary',app_private.crm_summary(org,p_location,cid,statement_timestamp()),'preferences',(select to_jsonb(p) from public.client_preferences p where p.organization_id=org and p.client_id=canonical),
 'technical_sources',coalesce((select jsonb_agg(jsonb_build_object('domain','hair_passport','id',p.id,'client_id',p.client_id,'version',p.version,'updated_at',p.updated_at)) from public.hair_passports p where p.organization_id=org and p.client_id=any(ids) and app_private.user_has_permission(org,p_location,'crm.notes.technical')),'[]'));
 elsif op='list' then
 filter:=coalesce(q->'filter','{}');
 if not app_private.salon_keys(filter,array['query','record_status','relationship_status','last_visit_min_days','service_last_visit_min_days','upcoming','preferred_staff_id','staff_history_id','service_id','last_no_show','technical_followup','technical_followup_kind']) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if exists(select 1 from jsonb_each(filter) e where jsonb_typeof(e.value) is distinct from case when e.key in ('last_no_show','technical_followup') then 'boolean' when e.key in ('last_visit_min_days','service_last_visit_min_days') then 'number' else 'string' end) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if coalesce(filter->>'record_status','ACTIVE') not in ('ACTIVE','ARCHIVED') or coalesce(filter->>'upcoming','ANY') not in ('ANY','HAS','NONE') or (filter ? 'last_visit_min_days' and (filter->>'last_visit_min_days')::integer not between 1 and 3650) or char_length(coalesce(filter->>'query',''))>80 or (filter ? 'relationship_status' and filter->>'relationship_status' not in ('NEW','ACTIVE','RETURNING','OVERDUE','INACTIVE','UPCOMING','FOLLOW_UP_REQUIRED')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if (filter ? 'technical_followup' or filter ? 'technical_followup_kind') and not app_private.user_has_permission(org,p_location,'crm.notes.technical') then return jsonb_build_object('code','FORBIDDEN');end if;
 if filter ? 'service_last_visit_min_days' and (not(filter ? 'service_id') or (filter->>'service_last_visit_min_days')::integer not between 1 and 3650) or filter ? 'technical_followup_kind' and filter->>'technical_followup_kind' not in ('CARE_CHECK_DUE','COLOR_FOLLOWUP_DUE','RECOVERY_REASSESSMENT_DUE') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 needle:=app_private.client_name_key(coalesce(filter->>'query',''));
 -- A bounded candidate scan avoids one technical/relationship aggregation per tenant row.
 with candidates as materialized(select c.*,row_number() over(order by c.name_normalized,c.id) rn from public.clients c where c.organization_id=org and c.status=coalesce(filter->>'record_status','ACTIVE') and not exists(select 1 from public.client_merge_links l where l.source_client_id=c.id)
 and (needle='' or c.name_normalized like '%'||needle||'%' or c.phone_normalized like '%'||regexp_replace(filter->>'query','[^0-9]','','g')||'%' and regexp_replace(filter->>'query','[^0-9]','','g')<>'' or position(lower(filter->>'query') in coalesce(c.email_normalized,''))>0)
 order by c.name_normalized,c.id offset v_offset limit 201),summaries as materialized(select c.*,app_private.crm_summary(org,p_location,c.id,statement_timestamp()) s from candidates c where c.rn<=v_offset+200),matched as materialized(select c.rn,jsonb_build_object('id',c.id,'full_name',c.full_name,'phone_masked',app_private.client_phone_mask(c.phone_normalized),'status',c.status,'summary',c.s) item from summaries c where
 (not(filter ? 'relationship_status') or c.s->>'relationship_status'=filter->>'relationship_status')
 and (not(filter ? 'last_visit_min_days') or (c.s->>'days_since_last_visit')::integer >=(filter->>'last_visit_min_days')::integer)
 and (coalesce(filter->>'upcoming','ANY')='ANY' or (filter->>'upcoming'='NONE')=(c.s->'upcoming_appointment'='null'::jsonb))
 and (not(filter ? 'preferred_staff_id') or c.s#>>'{preferred_staff,membership_id}'=filter->>'preferred_staff_id')
 and (not(filter ? 'staff_history_id') or exists(select 1 from public.salon_appointments a where a.organization_id=org and a.location_id=p_location and a.client_id=any(app_private.crm_family(org,c.id)) and a.staff_membership_id=(filter->>'staff_history_id')::uuid and a.status='COMPLETED'))
 and (not(filter ? 'technical_followup_kind') or exists(select 1 from jsonb_array_elements(c.s->'technical_followups') x where x->>'kind'=filter->>'technical_followup_kind'))
 and (not(filter ? 'service_id') or exists(select 1 from public.salon_appointments a where a.organization_id=org and a.location_id=p_location and a.client_id=any(app_private.crm_family(org,c.id)) and a.service_id=(filter->>'service_id')::uuid and a.status='COMPLETED'))
 and (not(filter ? 'service_last_visit_min_days') or (select floor(extract(epoch from (statement_timestamp()-max(a.completed_at)))/86400)::integer from public.salon_appointments a where a.organization_id=org and a.location_id=p_location and a.client_id=any(app_private.crm_family(org,c.id)) and a.service_id=(filter->>'service_id')::uuid and a.status='COMPLETED') >= (filter->>'service_last_visit_min_days')::integer)
 and (not(filter ? 'last_no_show') or (c.s#>>'{appointment_facts,last_status}'='NO_SHOW')=(filter->>'last_no_show')::boolean)
 and (not(filter ? 'technical_followup') or (jsonb_array_length(c.s->'technical_followups')>0)=(filter->>'technical_followup')::boolean)
 order by c.rn limit v_limit+1),shown as(select * from matched order by rn limit v_limit)
 select coalesce((select jsonb_agg(item order by rn) from shown),'[]'),(select count(*) from matched)>v_limit or (select count(*) from candidates)>200,case when (select count(*) from matched)>v_limit then (select max(rn)::integer from shown) else v_offset+200 end into items,more,next_offset;
 data:=jsonb_build_object('items',items,'has_more',more,'offset',v_offset,'next_offset',next_offset,'scan_limit',200);
 elsif op='timeline' then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select * from app_private.crm_timeline(org,p_location,ids) order by "timestamp" desc,event_key offset v_offset limit v_limit+1) x;
 data:=jsonb_build_object('items',items,'has_more',jsonb_array_length(items)>v_limit,'offset',v_offset);
 data:=jsonb_set(data,'{items}',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(items) with ordinality t(v,n) where n<=v_limit));
 elsif op='appointments' then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select a.id,a.client_id,a.start_at,a.end_at,a.service_id,a.service_name,a.staff_membership_id,a.staff_display_name,a.status,a.version,a.completed_at from public.salon_appointments a where a.organization_id=org and a.location_id=p_location and a.client_id=any(ids) order by a.start_at desc,a.id desc offset v_offset limit v_limit+1) x;
 data:=jsonb_build_object('items',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(items) with ordinality t(v,n) where n<=v_limit),'has_more',jsonb_array_length(items)>v_limit,'offset',v_offset);
 elsif op='notes' then
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select n.* from public.client_notes n where n.organization_id=org and n.location_id=p_location and n.client_id=any(ids) and not n.archived order by n.created_at desc,n.id offset v_offset limit v_limit+1) x;
 data:=jsonb_build_object('items',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(items) with ordinality t(v,n) where n<=v_limit),'has_more',jsonb_array_length(items)>v_limit,'offset',v_offset);
 elsif op='actions' then
 if q ? 'status' and q->>'status' not in ('OPEN','SNOOZED','DONE','DISMISSED') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select a.*,case when a.status='SNOOZED' and a.snoozed_until<=statement_timestamp() then 'OPEN' else a.status end effective_status from public.client_crm_actions a where a.organization_id=org and a.location_id=p_location and (cid is null or a.client_id=any(ids)) and (not(q ? 'status') or case when a.status='SNOOZED' and a.snoozed_until<=statement_timestamp() then 'OPEN' else a.status end=q->>'status') order by coalesce(a.snoozed_until,a.due_at),a.id offset v_offset limit v_limit+1) x;
 data:=jsonb_build_object('items',(select coalesce(jsonb_agg(v),'[]') from jsonb_array_elements(items) with ordinality t(v,n) where n<=v_limit),'has_more',jsonb_array_length(items)>v_limit,'offset',v_offset);
 elsif op='duplicates' then
 select * into source from public.clients c where c.organization_id=org and c.id=canonical;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into items from(select c.id,c.full_name,app_private.client_phone_mask(c.phone_normalized) phone_masked,c.status,c.version,
 array_remove(array[case when c.phone_normalized=source.phone_normalized then 'PHONE' end,case when c.email_normalized=source.email_normalized and source.email is not null then 'EMAIL' end,case when extensions.similarity(c.name_normalized,source.name_normalized)>=0.72 then 'NAME' end],null) signals
 from public.clients c where c.organization_id=org and c.id<>all(ids) and not exists(select 1 from public.client_merge_links l where l.source_client_id=c.id) and (c.phone_normalized=source.phone_normalized or c.email_normalized=source.email_normalized or extensions.similarity(c.name_normalized,source.name_normalized)>=0.72) order by (c.phone_normalized=source.phone_normalized) desc,c.id limit 20) x;
 data:=jsonb_build_object('items',items,'warning_only',true);
 elsif op='options' then
 data:=jsonb_build_object('services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'active',s.active,'return_window',(select to_jsonb(w) from public.service_return_windows w where w.service_id=s.id))) from (select * from public.salon_services s where s.organization_id=org and (s.location_id is null or s.location_id=p_location) order by s.active desc,s.name,s.id limit 200) s),'[]'),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.membership_id,'name',s.display_name,'active',s.active,'bookable',s.bookable)) from (select * from public.salon_staff s where s.organization_id=org and s.location_id=p_location order by s.active desc,s.display_name,s.membership_id limit 200) s),'[]'),
 'policy',(select to_jsonb(p) from public.client_relationship_policies p where p.location_id=p_location and p.organization_id=org));
 elsif op='merge_review' then
 if not exists(select 1 from public.salon_memberships m where m.id=p_membership and m.location_id is null and m.role_code in ('owner','manager')) then return jsonb_build_object('code','FORBIDDEN');end if;
 select * into source from public.clients c where c.organization_id=org and c.id=(q->>'source_client_id')::uuid;
 select * into target from public.clients c where c.organization_id=org and c.id=(q->>'target_client_id')::uuid;
 if source.id is null or target.id is null or source.id=target.id then return jsonb_build_object('code','CRM_NOT_FOUND');end if;
 if source.status<>'ACTIVE' or target.status<>'ACTIVE' or exists(select 1 from public.client_merge_links l where l.source_client_id in (source.id,target.id)) or cardinality(app_private.crm_family(org,source.id))+cardinality(app_private.crm_family(org,target.id))>20 then return jsonb_build_object('code','CRM_CONFLICT');end if;
 select to_jsonb(p) into sp from public.client_preferences p where p.client_id=source.id;select to_jsonb(p) into tp from public.client_preferences p where p.client_id=target.id;
 fingerprint:=encode(extensions.digest(jsonb_build_array(to_jsonb(source),to_jsonb(target),sp,tp,app_private.crm_family(org,source.id),app_private.crm_family(org,target.id))::text,'sha256'),'hex');token:=gen_random_uuid();
 insert into app_private.crm_merge_reviews values(token,org,p_location,auth.uid(),source.id,target.id,fingerprint,statement_timestamp()+interval '10 minutes');
 data:=jsonb_build_object('review_token',token,'source',to_jsonb(source),'target',to_jsonb(target),'source_preferences',sp,'target_preferences',tp,'source_client_ids',to_jsonb(app_private.crm_family(org,source.id)),'target_client_ids',to_jsonb(app_private.crm_family(org,target.id)),'required_decisions',jsonb_build_array('full_name','phone','email','birth_date','preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact'));
 end if;
 ctx:=app_private.hair_write_context(p_membership,p_location,case when op='merge_review' then 'crm.merge' else 'crm.read' end);if ctx ? 'code' then return ctx;end if;
 return jsonb_build_object('data',data);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then return jsonb_build_object('code','VALIDATION_FAILED');
end $$;

create or replace function app_private.crm_operation(p_membership uuid,p_location uuid,q jsonb,p_correlation uuid) returns jsonb language plpgsql security definer set search_path='' set row_security='on' as $$
declare org uuid;ctx jsonb;actor uuid:=auth.uid();stamp timestamptz:=statement_timestamp();op text:=q->>'type';permission text;allowed text[];mid uuid;eid uuid;cid uuid;expected bigint;v bigint;response jsonb;receipt app_private.crm_receipts%rowtype;d jsonb;prev jsonb;summary jsonb;basis jsonb;due timestamptz;note public.client_notes%rowtype;action public.client_crm_actions%rowtype;
 source public.clients%rowtype;target public.clients%rowtype;review app_private.crm_merge_reviews%rowtype;merge public.client_merge_operations%rowtype;sp jsonb;tp jsonb;selected jsonb:='{}'::jsonb;decisions jsonb;f text;fingerprint text;links jsonb;item jsonb;pref_version bigint;
begin
 permission:=case when op='PREFERENCE_SAVE' then 'crm.preferences.manage' when op='NOTE_SAVE' then app_private.crm_note_permission(q->>'visibility') when op='RETURN_WINDOW_SAVE' then 'salon.catalog.manage' when op='POLICY_SAVE' then 'crm.policy.manage' when op in ('ACTION_CREATE','ACTION_TRANSITION') then 'crm.actions.manage' when op in ('MERGE','MERGE_REVERSE') then 'crm.merge' end;
 if permission is null or actor is null or p_correlation is null or pg_column_size(q)>32768 or jsonb_typeof(q)<>'object' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(p_membership,p_location,permission);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 perform 1 from public.organizations o where o.id=org for update;
 ctx:=app_private.hair_write_context(p_membership,p_location,permission);if ctx ? 'code' then return ctx;end if;
 allowed:=case op when 'PREFERENCE_SAVE' then array['type','mutation_id','client_id','expected_version','definition'] when 'NOTE_SAVE' then array['type','mutation_id','id','client_id','expected_version','visibility','body','archived'] when 'RETURN_WINDOW_SAVE' then array['type','mutation_id','service_id','expected_version','min_days','max_days'] when 'POLICY_SAVE' then array['type','mutation_id','expected_version','inactive_after_overdue_days'] when 'ACTION_CREATE' then array['type','mutation_id','id','client_id','kind','source_domain','source_id'] when 'ACTION_TRANSITION' then array['type','mutation_id','id','expected_version','status','snoozed_until'] when 'MERGE' then array['type','mutation_id','review_token','decisions'] when 'MERGE_REVERSE' then array['type','mutation_id','merge_id','reason'] end;
 if not app_private.salon_keys(q,allowed) or jsonb_typeof(q->'mutation_id')<>'string' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 mid:=(q->>'mutation_id')::uuid;
 select * into receipt from app_private.crm_receipts r where r.organization_id=org and r.actor_id=actor and r.mutation_id=mid;
 if found then if receipt.location_id<>p_location or receipt.input<>q then return jsonb_build_object('code','CRM_CONFLICT');end if;return receipt.response;end if;
 if q ? 'expected_version' then if jsonb_typeof(q->'expected_version')<>'number' then return jsonb_build_object('code','VALIDATION_FAILED');end if;expected:=(q->>'expected_version')::bigint;if expected<0 then return jsonb_build_object('code','VALIDATION_FAILED');end if;end if;
 if q ? 'client_id' then cid:=(q->>'client_id')::uuid;
 if not exists(select 1 from public.clients c where c.organization_id=org and c.id=cid and c.status='ACTIVE') then return jsonb_build_object('code','CRM_NOT_FOUND');end if;
 if exists(select 1 from public.client_merge_links l where l.source_client_id=cid) then return jsonb_build_object('code','CRM_CONFLICT');end if;end if;
 if op='PREFERENCE_SAVE' then
 eid:=cid;d:=q->'definition';
 if not app_private.salon_keys(d,array['preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact']) or not(d ?& array['preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact']) or jsonb_typeof(d->'preferred_service_ids')<>'array' or jsonb_typeof(d->'allow_manual_contact')<>'boolean' or jsonb_typeof(d->'do_not_contact')<>'boolean' or d->>'preferred_channel' not in ('UNKNOWN','PHONE','WHATSAPP','EMAIL') or jsonb_typeof(d->'request_notes') not in ('null','string') or jsonb_typeof(d->'preferred_staff_id') not in ('null','string') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 if d->>'preferred_staff_id' is not null and not exists(select 1 from public.salon_staff s join public.salon_memberships m on m.id=s.membership_id and m.status='active' where s.organization_id=org and s.location_id=p_location and s.membership_id=(d->>'preferred_staff_id')::uuid and s.active) then return jsonb_build_object('code','CRM_NOT_FOUND');end if;
 if exists(select 1 from jsonb_array_elements_text(d->'preferred_service_ids') x where not exists(select 1 from public.salon_services s where s.id=x::uuid and s.organization_id=org and (s.location_id is null or s.location_id=p_location) and s.active)) or jsonb_array_length(d->'preferred_service_ids')<>(select count(distinct x) from jsonb_array_elements_text(d->'preferred_service_ids') x) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select coalesce(max(p.version),0) into v from public.client_preferences p where p.organization_id=org and p.client_id=cid;if expected is distinct from v then return jsonb_build_object('code','CRM_CONFLICT');end if;
 insert into public.client_preferences values(cid,org,(d->>'preferred_staff_id')::uuid,array(select x::uuid from jsonb_array_elements_text(d->'preferred_service_ids') x),d->>'request_notes',d->>'preferred_channel',(d->>'allow_manual_contact')::boolean,(d->>'do_not_contact')::boolean,v+1,stamp,actor)
 on conflict(client_id) do update set preferred_staff_id=excluded.preferred_staff_id,preferred_service_ids=excluded.preferred_service_ids,request_notes=excluded.request_notes,preferred_channel=excluded.preferred_channel,allow_manual_contact=excluded.allow_manual_contact,do_not_contact=excluded.do_not_contact,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 elsif op='NOTE_SAVE' then
 eid:=(q->>'id')::uuid;select * into note from public.client_notes n where n.organization_id=org and n.location_id=p_location and n.id=eid;
 if found and (note.client_id<>cid or not app_private.user_has_permission(org,p_location,app_private.crm_note_permission(note.visibility))) then return jsonb_build_object('code','CRM_NOT_FOUND');end if;
 v:=coalesce(note.version,0);if expected is distinct from v then return jsonb_build_object('code','CRM_CONFLICT');end if;
 if jsonb_typeof(q->'body')<>'string' or jsonb_typeof(q->'archived')<>'boolean' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 prev:=case when note.id is null then null else jsonb_build_object('visibility',note.visibility,'archived',note.archived,'version',note.version) end;
 insert into public.client_notes values(eid,org,p_location,cid,q->>'visibility',trim(q->>'body'),(q->>'archived')::boolean,v+1,stamp,stamp,actor,actor)
 on conflict(id) do update set visibility=excluded.visibility,body=excluded.body,archived=excluded.archived,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 elsif op='RETURN_WINDOW_SAVE' then
 eid:=(q->>'service_id')::uuid;if not exists(select 1 from public.salon_services s where s.id=eid and s.organization_id=org and (s.location_id is null or s.location_id=p_location)) then return jsonb_build_object('code','CRM_NOT_FOUND');end if;
 if jsonb_typeof(q->'min_days') not in ('number','null') or jsonb_typeof(q->'max_days') not in ('number','null') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select coalesce(max(w.version),0) into v from public.service_return_windows w where w.service_id=eid and w.organization_id=org;if expected is distinct from v then return jsonb_build_object('code','CRM_CONFLICT');end if;
 insert into public.service_return_windows values(eid,org,(q->>'min_days')::integer,(q->>'max_days')::integer,v+1,stamp,actor) on conflict(service_id) do update set min_days=excluded.min_days,max_days=excluded.max_days,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 elsif op='POLICY_SAVE' then
 eid:=p_location;if jsonb_typeof(q->'inactive_after_overdue_days') not in ('number','null') then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select coalesce(max(p.version),0) into v from public.client_relationship_policies p where p.organization_id=org and p.location_id=p_location;if expected is distinct from v then return jsonb_build_object('code','CRM_CONFLICT');end if;
 insert into public.client_relationship_policies values(org,p_location,(q->>'inactive_after_overdue_days')::integer,v+1,stamp,actor) on conflict(location_id) do update set inactive_after_overdue_days=excluded.inactive_after_overdue_days,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 elsif op='ACTION_CREATE' then
 eid:=(q->>'id')::uuid;v:=0;summary:=app_private.crm_summary(org,p_location,cid,stamp);
 if q->>'kind' in ('REBOOK','WIN_BACK') then
 if q->>'source_domain'<>'salon_appointment' or q->>'source_id' is distinct from summary#>>'{return_signal,appointment_id}' or (q->>'kind'='REBOOK' and summary#>>'{return_signal,status}' not in ('RETURN_WINDOW_OPEN','OVERDUE')) or (q->>'kind'='WIN_BACK' and summary->>'relationship_status'<>'INACTIVE') then return jsonb_build_object('code','CRM_SIGNAL_CHANGED');end if;
 basis:=summary->'return_signal';due:=stamp;
 elsif q->>'kind'='DUPLICATE_REVIEW' then
 if q->>'source_domain'<>'client' or (q->>'source_id')::uuid<>cid or not exists(select 1 from public.clients c join public.clients candidate on candidate.id=cid where c.organization_id=org and c.id<>cid and c.phone_normalized=candidate.phone_normalized and not exists(select 1 from public.client_merge_links l where l.source_client_id=c.id)) then return jsonb_build_object('code','CRM_SIGNAL_CHANGED');end if;
 basis:=jsonb_build_object('basis','SAME_NORMALIZED_PHONE_WARNING');due:=stamp;
 else
 if not app_private.user_has_permission(org,p_location,'crm.notes.technical') then return jsonb_build_object('code','FORBIDDEN');end if;
 select x into basis from jsonb_array_elements(summary->'technical_followups') x where x->>'kind'=q->>'kind'||'_DUE' and x->>'source_domain'=q->>'source_domain' and x->>'source_id'=q->>'source_id';
 if basis is null then return jsonb_build_object('code','CRM_SIGNAL_CHANGED');end if;due:=(basis->>'at')::timestamptz;
 end if;
 insert into public.client_crm_actions values(eid,org,p_location,cid,q->>'kind',q->>'source_domain',(q->>'source_id')::uuid,basis,'OPEN',due,null,1,stamp,stamp,actor,actor);
 elsif op='ACTION_TRANSITION' then
 eid:=(q->>'id')::uuid;select * into action from public.client_crm_actions a where a.organization_id=org and a.location_id=p_location and a.id=eid;
 if not found then return jsonb_build_object('code','CRM_NOT_FOUND');end if;v:=action.version;
 if expected is distinct from v then return jsonb_build_object('code','CRM_CONFLICT');end if;
 if action.status in ('DONE','DISMISSED') or q->>'status' not in ('SNOOZED','DONE','DISMISSED') then return jsonb_build_object('code','CRM_INVALID_TRANSITION');end if;
 if jsonb_typeof(q->'snoozed_until') not in ('string','null') or (q->>'status'='SNOOZED') is distinct from (q->>'snoozed_until' is not null) or (q->>'snoozed_until' is not null and ((q->>'snoozed_until')::timestamptz<=stamp or (q->>'snoozed_until')::timestamptz>stamp+interval '365 days')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 prev:=jsonb_build_object('status',action.status,'version',action.version);
 update public.client_crm_actions set status=q->>'status',snoozed_until=(q->>'snoozed_until')::timestamptz,version=v+1,updated_at=stamp,updated_by=actor where id=eid;
 elsif op in ('MERGE','MERGE_REVERSE') then
 if not exists(select 1 from public.salon_memberships m where m.id=p_membership and m.location_id is null and m.role_code in ('owner','manager')) then return jsonb_build_object('code','FORBIDDEN');end if;
 if op='MERGE' then
 select * into review from app_private.crm_merge_reviews r where r.token=(q->>'review_token')::uuid and r.organization_id=org and r.location_id=p_location and r.actor_id=actor and r.expires_at>stamp;
 if not found then return jsonb_build_object('code','CRM_REVIEW_EXPIRED');end if;
 select * into source from public.clients c where c.organization_id=org and c.id=review.source_client_id;select * into target from public.clients c where c.organization_id=org and c.id=review.target_client_id;
 select to_jsonb(p) into sp from public.client_preferences p where p.client_id=source.id;select to_jsonb(p) into tp from public.client_preferences p where p.client_id=target.id;
 fingerprint:=encode(extensions.digest(jsonb_build_array(to_jsonb(source),to_jsonb(target),sp,tp,app_private.crm_family(org,source.id),app_private.crm_family(org,target.id))::text,'sha256'),'hex');
 if fingerprint<>review.fingerprint or source.status<>'ACTIVE' or target.status<>'ACTIVE' or exists(select 1 from public.client_merge_links l where l.source_client_id in (source.id,target.id)) then return jsonb_build_object('code','CRM_REVIEW_EXPIRED');end if;
 decisions:=q->'decisions';
 if not app_private.salon_keys(decisions,array['full_name','phone','email','birth_date','preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact']) or not(decisions ?& array['full_name','phone','email','birth_date','preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact']) or exists(select 1 from jsonb_each(decisions) x where jsonb_typeof(x.value)<>'string' or x.value#>>'{}' not in ('SOURCE','TARGET')) then return jsonb_build_object('code','CRM_DECISIONS_REQUIRED');end if;
 foreach f in array array['full_name','phone','phone_normalized','email','birth_date'] loop
 selected:=selected||jsonb_build_object(f,case when decisions->>(case when f='phone_normalized' then 'phone' else f end)='SOURCE' then to_jsonb(source)->f else to_jsonb(target)->f end);end loop;
 foreach f in array array['preferred_staff_id','preferred_service_ids','request_notes','preferred_channel','allow_manual_contact','do_not_contact'] loop
 selected:=selected||jsonb_build_object(f,coalesce(case when decisions->>f='SOURCE' then sp->f else tp->f end,case f when 'preferred_service_ids' then '[]'::jsonb when 'preferred_channel' then '"UNKNOWN"'::jsonb when 'allow_manual_contact' then 'false'::jsonb when 'do_not_contact' then 'false'::jsonb else 'null'::jsonb end));end loop;
 eid:=gen_random_uuid();v:=target.version;pref_version:=coalesce((tp->>'version')::bigint,0)+1;
 select coalesce(jsonb_agg(to_jsonb(l)),'[]') into links from public.client_merge_links l where l.organization_id=org and l.target_client_id=source.id;
 insert into public.client_merge_operations values(eid,org,p_location,source.id,target.id,to_jsonb(source),to_jsonb(target),sp,tp,decisions,links,target.version+1,source.version+1,pref_version,actor,stamp);
 update public.clients set full_name=selected->>'full_name',phone=selected->>'phone',phone_normalized=selected->>'phone_normalized',email=selected->>'email',birth_date=(selected->>'birth_date')::date,version=version+1,updated_at=stamp,updated_by=actor where id=target.id;
 update public.clients set status='ARCHIVED',version=version+1,updated_at=stamp,updated_by=actor where id=source.id;
 insert into public.client_preferences values(target.id,org,(selected->>'preferred_staff_id')::uuid,array(select x::uuid from jsonb_array_elements_text(selected->'preferred_service_ids') x),selected->>'request_notes',selected->>'preferred_channel',(selected->>'allow_manual_contact')::boolean,(selected->>'do_not_contact')::boolean,pref_version,stamp,actor)
 on conflict(client_id) do update set preferred_staff_id=excluded.preferred_staff_id,preferred_service_ids=excluded.preferred_service_ids,request_notes=excluded.request_notes,preferred_channel=excluded.preferred_channel,allow_manual_contact=excluded.allow_manual_contact,do_not_contact=excluded.do_not_contact,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 update public.client_merge_links set target_client_id=target.id,merge_id=eid where organization_id=org and target_client_id=source.id;
 insert into public.client_merge_links values(source.id,org,target.id,eid);
 else
 eid:=(q->>'merge_id')::uuid;select * into merge from public.client_merge_operations m where m.organization_id=org and m.id=eid;
 if not found then return jsonb_build_object('code','CRM_NOT_FOUND');end if;
 if jsonb_typeof(q->'reason')<>'string' or char_length(trim(q->>'reason')) not between 1 and 500 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 select * into source from public.clients c where c.id=merge.source_client_id;select * into target from public.clients c where c.id=merge.target_client_id;
 select to_jsonb(p) into tp from public.client_preferences p where p.client_id=target.id;
 if source.version<>merge.source_after_version or target.version<>merge.target_after_version or (tp->>'version')::bigint<>merge.target_preferences_after_version or exists(select 1 from public.client_merge_reversals r where r.merge_id=eid) or not exists(select 1 from public.client_merge_links l where l.source_client_id=source.id and l.target_client_id=target.id and l.merge_id=eid) or exists(select 1 from public.client_merge_links l where l.source_client_id=target.id) then return jsonb_build_object('code','CRM_CONFLICT');end if;
 v:=target.version;
 update public.clients set full_name=merge.target_before->>'full_name',phone=merge.target_before->>'phone',phone_normalized=merge.target_before->>'phone_normalized',email=merge.target_before->>'email',birth_date=(merge.target_before->>'birth_date')::date,version=version+1,updated_at=stamp,updated_by=actor where id=target.id;
 update public.clients set status=merge.source_before->>'status',version=version+1,updated_at=stamp,updated_by=actor where id=source.id;
 delete from public.client_merge_links where organization_id=org and merge_id=eid;
 for item in select x from jsonb_array_elements(merge.previous_links) x loop insert into public.client_merge_links values((item->>'source_client_id')::uuid,org,(item->>'target_client_id')::uuid,(item->>'merge_id')::uuid);end loop;
 if merge.target_preferences_before is null then delete from public.client_preferences where client_id=target.id;
 else d:=merge.target_preferences_before;update public.client_preferences set preferred_staff_id=(d->>'preferred_staff_id')::uuid,preferred_service_ids=array(select x::uuid from jsonb_array_elements_text(d->'preferred_service_ids') x),request_notes=d->>'request_notes',preferred_channel=d->>'preferred_channel',allow_manual_contact=(d->>'allow_manual_contact')::boolean,do_not_contact=(d->>'do_not_contact')::boolean,version=version+1,updated_at=stamp,updated_by=actor where client_id=target.id;end if;
 insert into public.client_merge_reversals values(eid,org,p_location,actor,stamp,trim(q->>'reason'));
 end if;
 end if;
 response:=jsonb_build_object('data',jsonb_build_object('id',eid,'version',v+1));
 insert into public.audit_events(actor_user_id,organization_id,location_id,action,entity_type,entity_id,reason,metadata,correlation_id) values(actor,org,p_location,
 case op when 'PREFERENCE_SAVE' then 'crm.preference.changed' when 'NOTE_SAVE' then case when note.id is null then 'crm.note.created' when note.visibility<>q->>'visibility' then 'crm.note.visibility_changed' else 'crm.note.updated' end when 'ACTION_CREATE' then 'crm.action.created' when 'ACTION_TRANSITION' then case q->>'status' when 'SNOOZED' then 'crm.action.snoozed' when 'DONE' then 'crm.action.completed' else 'crm.action.dismissed' end when 'MERGE' then 'crm.client.merged' when 'MERGE_REVERSE' then 'crm.merge.reversed' when 'RETURN_WINDOW_SAVE' then 'crm.return_window.changed' else 'crm.policy.changed' end,
 'client_crm',eid,'Explicit client operation',jsonb_build_object('operation',op,'previous',prev,'version',v+1,'decided_fields',case when op='MERGE' then (select jsonb_agg(k) from jsonb_object_keys(decisions) k) else null end),p_correlation);
 if op='MERGE' then insert into public.audit_events(actor_user_id,organization_id,location_id,action,entity_type,entity_id,reason,metadata,correlation_id) values(actor,org,p_location,'crm.merge.conflicts_resolved','client_crm',eid,'Explicit field choices',jsonb_build_object('source_client_id',source.id,'target_client_id',target.id),p_correlation);end if;
 insert into app_private.crm_receipts values(org,p_location,actor,mid,q,response);return response;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then return jsonb_build_object('code','VALIDATION_FAILED');when unique_violation then return jsonb_build_object('code','CRM_CONFLICT');
end $$;
