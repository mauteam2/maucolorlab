-- Preserve actual recipe/outcome memory and point recovery actions at their real plan source.
alter table public.client_crm_actions drop constraint client_crm_actions_source_domain_check;
alter table public.client_crm_actions add constraint client_crm_actions_source_domain_check check(source_domain in ('salon_appointment','live_session','client','color_plan'));
create or replace function app_private.crm_summary(org uuid,loc uuid,client uuid,stamp timestamptz) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ids uuid[]:=app_private.crm_family(org,client);canonical uuid;tz text;today date;last_ap public.salon_appointments%rowtype;future public.salon_appointments%rowtype;
 pref public.client_preferences%rowtype;win public.service_return_windows%rowtype;policy public.client_relationship_policies%rowtype;
 visits integer;cancels integer;misses integer;first_at timestamptz;days integer;average_days numeric;status text;signal text;staff_basis jsonb;usual jsonb;facts jsonb;technical jsonb;latest_live public.live_sessions%rowtype;last_plan public.color_plans%rowtype;recipe jsonb;memory jsonb;
begin
 canonical:=coalesce((select l.target_client_id from public.client_merge_links l where l.organization_id=org and l.source_client_id=client),client);
 select l.timezone into tz from public.locations l where l.organization_id=org and l.id=loc;today:=(stamp at time zone tz)::date;
 select count(*) filter(where a.status='COMPLETED'),count(*) filter(where a.status='CANCELLED'),count(*) filter(where a.status='NO_SHOW'),min(a.completed_at) filter(where a.status='COMPLETED')
 into visits,cancels,misses,first_at from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids);
 select * into last_ap from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids) and a.status='COMPLETED' order by a.completed_at desc,a.id desc limit 1;
 select * into future from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids) and a.status in ('DRAFT','CONFIRMED','ARRIVED','IN_SERVICE') and a.end_at>=stamp order by a.start_at,a.id limit 1;
 select * into pref from public.client_preferences p where p.organization_id=org and p.client_id=canonical;
 select * into win from public.service_return_windows w where w.organization_id=org and w.service_id=last_ap.service_id;
 select * into policy from public.client_relationship_policies p where p.organization_id=org and p.location_id=loc;
 if last_ap.id is not null then days:=greatest(0,today-(last_ap.completed_at at time zone tz)::date);end if;
 -- Relevant-category intervals from at most 12 actual completed visits, with >=3 samples.
 with recent as(select a.completed_at from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids) and a.status='COMPLETED' and a.service_id=last_ap.service_id order by a.completed_at desc,a.id desc limit 12),intervals as(select extract(epoch from (completed_at-lag(completed_at) over(order by completed_at)))/86400 value from recent)
 select case when count(value)>=2 then round(avg(value),2) end into average_days from intervals;
 with recent as(select a.staff_membership_id,a.staff_display_name from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids) and a.status='COMPLETED' order by a.completed_at desc,a.id desc limit 6),counts as(select r.staff_membership_id,max(r.staff_display_name) name,count(*) n from recent r group by r.staff_membership_id),pattern as(select * from counts order by n desc,staff_membership_id limit 1)
 select case when p.n>=3 and p.n::numeric/(select count(*) from recent)>=0.75 then jsonb_build_object('source','HISTORICAL_PATTERN','membership_id',p.staff_membership_id,'name',p.name,'count',p.n,'sample_size',(select count(*) from recent)) else jsonb_build_object('source','UNKNOWN','membership_id',null,'name',null,'count',0,'sample_size',(select count(*) from recent)) end into staff_basis from pattern p;
 staff_basis:=coalesce(staff_basis,jsonb_build_object('source','UNKNOWN','membership_id',null,'name',null,'count',0,'sample_size',0));
 if pref.preferred_staff_id is not null then
 select jsonb_build_object('source','MANUAL_PREFERENCE','membership_id',pref.preferred_staff_id,'name',coalesce(s.display_name,'Arşivlenen personel'),'count',null,'sample_size',null) into staff_basis from public.salon_staff s where s.organization_id=org and s.location_id=loc and s.membership_id=pref.preferred_staff_id;
 staff_basis:=coalesce(staff_basis,jsonb_build_object('source','MANUAL_PREFERENCE','membership_id',pref.preferred_staff_id,'name',null,'count',null,'sample_size',null));end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into usual from(select a.service_id,max(a.service_name) name,count(*) count from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids) and a.status='COMPLETED' group by a.service_id order by count(*) desc,a.service_id limit 5) x;
 select jsonb_build_object('sample_size',count(*),'completed',count(*) filter(where x.status='COMPLETED'),'cancelled',count(*) filter(where x.status='CANCELLED'),'no_show',count(*) filter(where x.status='NO_SHOW'),'last_status',(array_agg(x.status order by x.start_at desc,x.id desc))[1]) into facts from(select a.id,a.status,a.start_at from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids) and a.status in ('COMPLETED','CANCELLED','NO_SHOW') order by a.start_at desc,a.id desc limit 12) x;
 technical:='[]';
 if app_private.user_has_permission(org,loc,'crm.notes.technical') then
 select * into latest_live from public.live_sessions l where l.organization_id=org and l.location_id=loc and l.client_id=any(ids) and l.status='COMPLETED' order by l.completed_at desc,l.id desc limit 1;
 if latest_live.id is not null then
 select r into recipe from jsonb_array_elements(latest_live.payload->'recipes') r where r->>'id'=latest_live.payload->>'currentRecipeId' limit 1;
 memory:=jsonb_build_object('session_id',latest_live.id,'client_id',latest_live.client_id,'recipe_id',latest_live.current_recipe_id,'completed_at',latest_live.completed_at,'recipe_label',recipe#>>'{result,selected,displayName}','color_grams',recipe#>'{result,colorGrams}','developer_grams',recipe#>'{result,developerGrams}','professional_assessment',latest_live.payload#>>'{outcome,professionalAssessment}','profile',latest_live.payload#>'{outcome,profile}');end if;
 if latest_live.payload#>>'{outcome,profile,hairIntegrity}' in ('CONCERN','UNACCEPTABLE') then technical:=technical||jsonb_build_array(jsonb_build_object('kind','CARE_CHECK_DUE','source_domain','live_session','source_id',latest_live.id,'at',latest_live.completed_at,'basis','OUTCOME_INTEGRITY_'||(latest_live.payload#>>'{outcome,profile,hairIntegrity}')));end if;
 if latest_live.payload#>>'{outcome,profile,colorAccuracy}' in ('CONCERN','UNACCEPTABLE') or latest_live.payload#>>'{outcome,profile,formulaStability}' in ('CONCERN','UNACCEPTABLE') then technical:=technical||jsonb_build_array(jsonb_build_object('kind','COLOR_FOLLOWUP_DUE','source_domain','live_session','source_id',latest_live.id,'at',latest_live.completed_at,'basis','RECORDED_OUTCOME_CONCERN'));end if;
 -- Existing Color Engine gate, not a second Risk Engine.
 select * into last_plan from public.color_plans p where p.organization_id=org and p.location_id=loc and p.client_id=any(ids) order by p.created_at desc,p.id desc limit 1;
 if last_plan.status='REQUIRES_RECOVERY' then
 technical:=technical||jsonb_build_array(jsonb_build_object('kind','RECOVERY_REASSESSMENT_DUE','source_domain','color_plan','source_id',last_plan.id,'at',last_plan.created_at,'basis','EXISTING_COLOR_PLAN_REQUIRES_RECOVERY'));end if;end if;
 signal:=case when last_ap.id is null or win.min_days is null then 'INSUFFICIENT_DATA'
 when exists(select 1 from public.salon_appointments a where a.organization_id=org and a.location_id=loc and a.client_id=any(ids) and a.service_id=last_ap.service_id and a.status in ('DRAFT','CONFIRMED','ARRIVED','IN_SERVICE') and a.end_at>=stamp) then 'ALREADY_BOOKED'
 when days>win.max_days then 'OVERDUE' when days>=win.min_days then 'RETURN_WINDOW_OPEN' else 'NOT_YET_DUE' end;
 status:=case when future.id is not null then 'UPCOMING' when jsonb_array_length(technical)>0 then 'FOLLOW_UP_REQUIRED' when visits=0 then 'NEW'
 when signal='OVERDUE' and policy.inactive_after_overdue_days is not null and days-win.max_days>=policy.inactive_after_overdue_days then 'INACTIVE'
 when signal='OVERDUE' then 'OVERDUE' when visits>=2 then 'RETURNING' else 'ACTIVE' end;
 return jsonb_build_object('client_id',canonical,'requested_client_id',client,'organization_id',org,'location_id',loc,'source_client_ids',to_jsonb(ids),'computed_at',stamp,
 'relationship_status',status,'last_visit_at',last_ap.completed_at,'first_visit_at',first_at,'total_completed_visits',visits,'cancellation_count',cancels,'no_show_count',misses,
 'days_since_last_visit',days,'average_visit_interval_days',average_days,'interval_basis',case when average_days is null then 'INSUFFICIENT_DATA' else 'LAST_12_COMPLETED_SAME_SERVICE' end,
 'last_completed_service',case when last_ap.id is null then null else jsonb_build_object('id',last_ap.service_id,'name',last_ap.service_name,'appointment_id',last_ap.id) end,
 'last_staff_member',case when last_ap.id is null then null else jsonb_build_object('id',last_ap.staff_membership_id,'name',last_ap.staff_display_name) end,
 'upcoming_appointment',case when future.id is null then null else jsonb_build_object('id',future.id,'client_id',future.client_id,'start_at',future.start_at,'service_id',future.service_id,'service_name',future.service_name,'staff_id',future.staff_membership_id,'staff_name',future.staff_display_name,'status',future.status,'precheck','NOT_ASSESSED') end,
 'usual_services',usual,'preferred_staff',staff_basis,'appointment_facts',facts,'technical_followups',technical,
 'return_signal',jsonb_build_object('status',signal,'service_id',last_ap.service_id,'appointment_id',last_ap.id,'days_since',days,'min_days',win.min_days,'max_days',win.max_days,'policy_version',win.version),
 'last_technical_memory',memory,'finance','NOT_AVAILABLE','recovery_state','NOT_ASSESSED');
end $$;
