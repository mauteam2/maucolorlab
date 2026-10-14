-- Quota growth and subscription changes share one organization protocol.
-- Invited users reserve distinct-person seats before activation.
create function app_private.saas_structure_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid:=new.organization_id;growth boolean;bootstrap boolean;begin
 perform pg_advisory_xact_lock(hashtextextended(org::text,0));
 perform pg_advisory_xact_lock(hashtextextended(org::text||':saas',71));
 if tg_table_name='locations' then
  growth:=new.archived_at is null and (tg_op='INSERT' or old.archived_at is not null);
  bootstrap:=not exists(select 1 from public.locations where organization_id=org and archived_at is null)
   and (app_private.saas_current(org)->>'status')='UNCONFIGURED';
  if growth and not bootstrap then perform app_private.saas_quota(org,'LOCATIONS',1);end if;
 else
  growth:=new.status in ('active','invited') and not exists(select 1 from public.salon_memberships m where m.organization_id=org and m.user_id=new.user_id and m.status in ('active','invited') and m.id<>new.id);
  if tg_op='UPDATE' and old.status in ('active','invited') and old.user_id=new.user_id and old.organization_id=org then growth:=false;end if;
  bootstrap:=new.role_code='owner' and new.location_id is null and new.status='active'
   and not exists(select 1 from public.salon_memberships where organization_id=org)
   and (app_private.saas_current(org)->>'status')='UNCONFIGURED';
  if growth and not bootstrap then perform app_private.saas_quota(org,'ACTIVE_MEMBERS',1);end if;
 end if;
 return new;
end$$;
revoke all on function app_private.saas_structure_guard() from public,anon,authenticated,service_role;
create trigger saas_location_quota before insert or update on public.locations for each row execute function app_private.saas_structure_guard();
create trigger saas_member_quota before insert or update on public.salon_memberships for each row execute function app_private.saas_structure_guard();

create function app_private.saas_source_gate() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new);org uuid:=(j->>'organization_id')::uuid;loc uuid:=(j->>'location_id')::uuid;cap text;perm text;begin
 if tg_table_name='color_plans' then
  cap:='COLOR_ENGINE';perm:='color_plan.create';
  -- No shared-to-exclusive upgrade: concurrent successful engine stores take
  -- the exclusive usage/quota lock first and retain it through source commit.
  perform pg_advisory_xact_lock(hashtextextended(org::text||':saas',71));
 elsif tg_table_name='controlled_brand_recipes' then cap:='BRAND_ADAPTER';perm:='color_plan.create';
 elsif tg_table_name='live_sessions' then cap:='LIVE_SESSION';perm:='live_session.start';
 elsif tg_table_name='clients' then cap:='CRM';perm:='clients.create';loc:=(j->>'creation_location_id')::uuid;
 elsif tg_table_name='stock_movements' then
  -- Trusted existing-session usage/reconciliation and compensated historical
  -- movements must remain possible after suspension. Stock source guards
  -- continue to validate every relation, quantity and immutable delta.
  if j->>'reversal_of' is not null or exists(select 1 from public.stock_source_events e where e.id=(j->>'source_event_id')::uuid
   and e.organization_id=org and e.location_id=loc and e.session_id=(j->>'source_session_id')::uuid
   and e.source_domain in ('LIVE_USAGE','MATERIAL_RECONCILIATION')) then return new;end if;
  cap:='STOCK';perm:=case when j->>'movement_type' in ('OPENING','RECEIPT') then 'stock.receive' else 'stock.adjust' end;
 elsif tg_table_name='finance_documents' then
  if j->>'type' not in ('SERVICE_CHARGE','RETAIL_SALE','EXPENSE','DEPOSIT') then return new;end if;
  cap:='FINANCE';perm:=case j->>'type' when 'EXPENSE' then 'finance.expense.manage' when 'DEPOSIT' then 'finance.payment' else 'finance.charge' end;
 elsif tg_table_name='commission_policy_versions' then cap:='COMMISSION';perm:='commission.manage_policies';
 elsif tg_table_name='report_settings' then cap:='REPORTING';perm:='reports.manage';
 else raise exception 'Unmapped SaaS source';end if;
 -- This check is additional to unchanged source RPC/RLS checks; it does not
 -- turn feature ownership into user authorization.
 if auth.uid() is not null and not app_private.user_has_permission(org,loc,perm) then raise exception using errcode='42501',message='FORBIDDEN';end if;
 perform app_private.saas_require(org,cap);
 if tg_table_name='color_plans' and j->>'status'='DRAFT' then perform app_private.saas_quota(org,'ENGINE_EXECUTIONS',1);end if;
 return new;
end$$;
revoke all on function app_private.saas_source_gate() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['color_plans','controlled_brand_recipes','live_sessions','clients','stock_movements','finance_documents','commission_policy_versions','report_settings'] loop
  execute format('create trigger saas_new_work before insert on public.%I for each row execute function app_private.saas_source_gate()',t);
 end loop;
end$$;
create trigger saas_report_configuration before update on public.report_settings for each row execute function app_private.saas_source_gate();

create function app_private.saas_engine_meter() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='DRAFT' then
  perform app_private.saas_record_usage(new.organization_id,new.location_id,'ENGINE_EXECUTIONS','COLOR_PLAN',new.id,1,
   encode(extensions.digest(convert_to(new.id::text||':'||new.request_id::text||':'||new.status,'UTF8'),'sha256'),'hex'));
 end if;
 return new;
end$$;
revoke all on function app_private.saas_engine_meter() from public,anon,authenticated,service_role;
create trigger saas_successful_engine after insert on public.color_plans for each row execute function app_private.saas_engine_meter();
