-- CRM reads have optional pagination/filter fields. Mutations retain exact-key validation.
create function app_private.crm_allowed_keys(v jsonb,allowed text[]) returns boolean language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(v)='object' then not exists(select 1 from jsonb_object_keys(v) k where not(k=any(allowed))) else false end;
$$;
revoke all on function app_private.crm_allowed_keys(jsonb,text[]) from public,anon,authenticated,service_role;
grant execute on function app_private.crm_allowed_keys(jsonb,text[]) to elifora_crm_writer;
create or replace function app_private.crm_read(p_membership uuid,p_location uuid,q jsonb) returns jsonb language plpgsql security definer set search_path='' set row_security='on' set statement_timeout='5s' as $$
declare ctx jsonb;org uuid;op text:=q->>'operation';allowed text[];cid uuid;canonical uuid;ids uuid[];v_offset integer:=coalesce((q->>'offset')::integer,0);v_limit integer:=coalesce((q->>'limit')::integer,25);items jsonb;more boolean;next_offset integer;filter jsonb;needle text;fingerprint text;token uuid;source public.clients%rowtype;target public.clients%rowtype;sp jsonb;tp jsonb;data jsonb;
begin
 ctx:=app_private.hair_write_context(p_membership,p_location,case when op='merge_review' then 'crm.merge' else 'crm.read' end);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 allowed:=case when op='list' then array['operation','filter','offset','limit'] when op in ('timeline','appointments','notes','actions') then array['operation','client_id','offset','limit','status'] when op='merge_review' then array['operation','source_client_id','target_client_id'] when op='options' then array['operation'] else array['operation','client_id'] end;
 if not app_private.crm_allowed_keys(q,allowed) or op is null or op not in ('summary','list','timeline','appointments','notes','actions','duplicates','merge_review','options') or v_offset not between 0 and 10000 or v_limit not between 1 and 50 or pg_column_size(q)>8192 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
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
 if not app_private.crm_allowed_keys(filter,array['query','record_status','relationship_status','last_visit_min_days','service_last_visit_min_days','upcoming','preferred_staff_id','staff_history_id','service_id','last_no_show','technical_followup','technical_followup_kind']) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
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
