-- Narrow, explicit authenticated RPC. PostgreSQL-owned functions are needed to
-- read authoritative facts without exposing private earnings to stock operators.
-- Every external operation resolves current membership before and after locks.
create function public.costing_operation(p_membership_id uuid,p_location_id uuid,p_command jsonb,p_correlation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb;org uuid;op text:=p_command->>'type';q jsonb:=p_command;perm text;mid uuid;eid uuid;item uuid;lot uuid;staff uuid;po public.commission_policies%rowtype;pv public.commission_policy_versions%rowtype;asgn public.commission_assignments%rowtype;r public.profitability_revenue_facts%rowtype;b public.stock_cost_basis_events%rowtype;receipt app_private.costing_receipts%rowtype;reply jsonb;allowed text[];qty numeric;vn numeric;vd numeric;g numeric;unit_n numeric;unit_d numeric;ef timestamptz;eu timestamptz;cc text;why text;err text;f record;begin
 perm:=case op when 'INTAKE' then 'cost.manage_acquisition' when 'SET_BASIS' then 'cost.correct' when 'DECLARE_NO_STOCK' then 'cost.correct' when 'ATTRIBUTE_RETAIL' then 'commission.manage_policies' when 'PROCESS_CHARGE' then 'commission.manage_policies' when 'POLICY_VERSION' then 'commission.manage_policies' when 'ASSIGN' then 'commission.manage_policies' when 'ASSIGN_END' then 'commission.manage_policies' end;
 if perm is null or p_correlation_id is null or jsonb_typeof(q)<>'object' or pg_column_size(q)>32768 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,perm);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 allowed:=case op when 'INTAKE' then array['type','mutation_id','stock_command','currency','total_cost_minor','unit_cost_numerator','unit_cost_denominator','cost_basis_at','external_reference','reason'] when 'SET_BASIS' then array['type','mutation_id','stock_item_id','lot_id','expected_version','currency','unit_cost_numerator','unit_cost_denominator','cost_basis_at','reason'] when 'POLICY_VERSION' then array['type','mutation_id','id','expected_version','name','domain','method','rate_bps','fixed_minor','currency','effective_from','reason'] when 'ASSIGN' then array['type','mutation_id','id','staff_user_id','policy_id','scope','service_id','category','effective_from','effective_until','reason'] when 'ASSIGN_END' then array['type','mutation_id','assignment_id','effective_until','reason'] when 'ATTRIBUTE_RETAIL' then array['type','mutation_id','charge_id','staff_user_id','reason'] else array['type','mutation_id','charge_id','reason'] end;
 if exists(select 1 from jsonb_object_keys(q) k where k<>all(allowed)) or jsonb_typeof(q->'mutation_id') is distinct from 'string' or jsonb_typeof(q->'reason') is distinct from 'string' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 begin mid:=(q->>'mutation_id')::uuid;exception when invalid_text_representation then return jsonb_build_object('code','VALIDATION_FAILED');end;
 why:=trim(q->>'reason');if mid is null or char_length(why) not between 1 and 2000 then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||auth.uid()::text||':'||mid::text,13));
 perform pg_advisory_xact_lock_shared(hashtextextended(org::text,0));
 if op not in ('INTAKE','SET_BASIS') then perform pg_advisory_xact_lock(hashtextextended(org::text||':'||p_location_id::text||':MAIN',8));end if;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,perm);if ctx ? 'code' then return ctx;end if;
 select * into receipt from app_private.costing_receipts where organization_id=org and actor_id=auth.uid() and mutation_id=mid;
 if found then if receipt.location_id<>p_location_id or receipt.input<>q then return jsonb_build_object('code','COST_CONFLICT');end if;return receipt.response;end if;
 begin
  cc:=(select base_currency from public.organizations where id=org);
  if op in ('INTAKE','SET_BASIS','POLICY_VERSION') and (jsonb_typeof(q->'currency') is distinct from 'string' or q->>'currency'<>cc) then raise exception using errcode='22023',message='CURRENCY_MISMATCH';end if;
  if op in ('INTAKE','SET_BASIS') then
   if jsonb_typeof(q->'cost_basis_at') is distinct from 'string' or (q->>'cost_basis_at')::timestamptz>statement_timestamp()+interval '5 minutes' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
   if q->>'total_cost_minor' is not null then
    if op<>'INTAKE' or q->>'unit_cost_numerator' is not null or q->>'unit_cost_denominator' is not null then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
    vn:=app_private.finance_minor(q->'total_cost_minor',true);vd:=1;
   else
    if jsonb_typeof(q->'unit_cost_numerator') is distinct from 'string' or jsonb_typeof(q->'unit_cost_denominator') is distinct from 'string' or q->>'unit_cost_numerator' !~ '^(0|[1-9][0-9]{0,15})$' or q->>'unit_cost_denominator' !~ '^[1-9][0-9]{0,15}$' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
    unit_n:=(q->>'unit_cost_numerator')::numeric;unit_d:=(q->>'unit_cost_denominator')::numeric;
   end if;
   if op='INTAKE' then
    if jsonb_typeof(q->'stock_command') is distinct from 'object' or q->'stock_command'->>'type' not in ('OPENING','RECEIPT') or q->'stock_command'->>'mutation_id'<>mid::text then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
    if not app_private.user_has_permission(org,p_location_id,'stock.receive') then raise exception using errcode='42501',message='FORBIDDEN';end if;
    item:=(q->'stock_command'->>'stock_item_id')::uuid;qty:=(q->'stock_command'->>'quantity')::numeric*100;
    if qty<=0 or qty<>trunc(qty) or qty>999999999999 then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
    -- Match the stock receipt lock BEFORE its item lock to prevent inversion.
    perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||mid::text,4));
   else item:=(q->>'stock_item_id')::uuid;end if;
   perform 1 from public.stock_items where id=item and organization_id=org and location_id=p_location_id for update;if not found then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
   if op='INTAKE' then
    if vn is null then vn:=unit_n*qty;vd:=unit_d*100;end if;g:=app_private.cost_gcd(vn,vd);vn:=div(vn,g);vd:=div(vd,g);
    if q->>'external_reference' is not null and (jsonb_typeof(q->'external_reference')<>'string' or char_length(q->>'external_reference')>160) then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
    if exists(select 1 from app_private.stock_receipts where organization_id=org and actor_id=auth.uid() and mutation_id=mid) then raise exception using errcode='22023',message='COST_CONFLICT';end if;
    insert into app_private.cost_intake_requests values(org,p_location_id,auth.uid(),mid,item,qty,vn,vd,cc,(q->>'cost_basis_at')::timestamptz,q->>'external_reference');
    reply:=public.stock_operation(p_membership_id,p_location_id,q->'stock_command',p_correlation_id);if reply ? 'code' then raise exception using errcode='22023',message=reply->>'code';end if;
    eid:=(reply->'data'->>'id')::uuid;
   else
    lot:=(q->>'lot_id')::uuid;if lot is not null then perform 1 from public.stock_lots where id=lot and stock_item_id=item for update;if not found then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;end if;
    select * into b from public.stock_cost_basis_events where stock_item_id=item and stock_lot_id is not distinct from lot order by version desc limit 1;
    if jsonb_typeof(q->'expected_version') is distinct from 'number' or (q->>'expected_version')::numeric<>coalesce(b.version,0) then raise exception using errcode='22023',message='COST_CONFLICT';end if;
    select coalesce(sum(quantity_delta),0)*100 into qty from public.stock_movements where stock_item_id=item and (lot is null or stock_lot_id=lot);
    if qty<=0 then raise exception using errcode='22023',message='COST_NO_POSITIVE_QUANTITY';end if;
    vn:=unit_n*qty;vd:=unit_d*100;g:=app_private.cost_gcd(vn,vd);
    insert into public.stock_cost_basis_events(organization_id,location_id,stock_item_id,stock_lot_id,version,previous_event_id,quantity_hundredths,value_numerator,value_denominator,status,currency,event_type,incoming_numerator,incoming_denominator,cost_basis_at,reason,actor_id,correlation_id,mutation_id)
    values(org,p_location_id,item,lot,coalesce(b.version,0)+1,b.id,qty,div(vn,g),div(vd,g),'KNOWN',cc,'FUTURE_CORRECTION',unit_n,unit_d,(q->>'cost_basis_at')::timestamptz,why,auth.uid(),p_correlation_id,mid) returning id into eid;
   end if;
  elsif op='POLICY_VERSION' then
   eid:=(q->>'id')::uuid;select * into po from public.commission_policies where id=eid;
   if found and (po.organization_id<>org or po.location_id<>p_location_id or po.name<>q->>'name' or po.domain<>q->>'domain') then raise exception using errcode='22023',message='COST_CONFLICT';end if;
   select * into pv from public.commission_policy_versions where policy_id=eid order by version desc limit 1;
   if jsonb_typeof(q->'expected_version') is distinct from 'number' or (q->>'expected_version')::numeric<>coalesce(pv.version,0) then raise exception using errcode='22023',message='COST_CONFLICT';end if;
   ef:=(q->>'effective_from')::timestamptz;
   if ef is null or ef<statement_timestamp()-interval '5 minutes' or pv.version is not null and ef<=pv.effective_from or exists(select 1 from public.profitability_revenue_facts where organization_id=org and location_id=p_location_id and eligible_at>=ef) then raise exception using errcode='22023',message='COMMISSION_RETROACTIVE_DENIED';end if;
   if q->>'domain' not in ('SERVICE','RETAIL') or jsonb_typeof(q->'name') is distinct from 'string' or char_length(trim(q->>'name')) not between 1 and 160 or q->>'method' not in ('PERCENT_GROSS','PERCENT_NET_OF_TAX','FIXED_AMOUNT') then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
   if q->>'method'='FIXED_AMOUNT' then vn:=app_private.finance_minor(q->'fixed_minor',true);if q->'rate_bps'<>'null'::jsonb then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
   else if jsonb_typeof(q->'rate_bps') is distinct from 'number' or (q->>'rate_bps')::numeric<>trunc((q->>'rate_bps')::numeric) or (q->>'rate_bps')::integer not between 0 and 10000 or q->'fixed_minor'<>'null'::jsonb then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;end if;
   insert into public.commission_policies(id,organization_id,location_id,name,domain,created_by) values(eid,org,p_location_id,trim(q->>'name'),q->>'domain',auth.uid()) on conflict(id) do nothing;
   insert into public.commission_policy_versions values(eid,org,p_location_id,coalesce(pv.version,0)+1,q->>'method',(q->>'rate_bps')::integer,vn,cc,ef,why,auth.uid(),statement_timestamp(),p_correlation_id);
  elsif op='ASSIGN' then
   eid:=(q->>'id')::uuid;staff:=(q->>'staff_user_id')::uuid;ef:=(q->>'effective_from')::timestamptz;eu:=(q->>'effective_until')::timestamptz;
   select * into po from public.commission_policies where id=(q->>'policy_id')::uuid and organization_id=org and location_id=p_location_id;if not found then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
   if not exists(select 1 from public.salon_staff s join public.salon_memberships m on m.id=s.membership_id where s.organization_id=org and s.location_id=p_location_id and s.active and m.status='active' and m.user_id=staff) then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
   if ef is null or ef<statement_timestamp()-interval '5 minutes' or exists(select 1 from public.profitability_revenue_facts where organization_id=org and location_id=p_location_id and eligible_at>=ef) then raise exception using errcode='22023',message='COMMISSION_RETROACTIVE_DENIED';end if;
   if q->>'scope' not in ('SERVICE','SERVICE_CATEGORY','DEFAULT_SERVICE','DEFAULT_RETAIL') or (q->>'scope'='DEFAULT_RETAIL')<>(po.domain='RETAIL') then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
   if q->>'service_id' is not null and not exists(select 1 from public.salon_services where id=(q->>'service_id')::uuid and organization_id=org and (location_id is null or location_id=p_location_id)) then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
   if q->>'category' is not null and not exists(select 1 from public.salon_categories where organization_id=org and code=q->>'category') then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
   if exists(select 1 from public.commission_assignments x left join public.commission_assignment_endings en on en.assignment_id=x.id where x.organization_id=org and x.location_id=p_location_id and x.staff_user_id=staff and x.scope=q->>'scope' and x.service_id is not distinct from (q->>'service_id')::uuid and x.category is not distinct from q->>'category' and tstzrange(x.effective_from,least(x.effective_until,en.effective_until),'[)') && tstzrange(ef,eu,'[)')) then raise exception using errcode='22023',message='COMMISSION_ASSIGNMENT_OVERLAP';end if;
   insert into public.commission_assignments values(eid,org,p_location_id,staff,po.id,q->>'scope',(q->>'service_id')::uuid,q->>'category',ef,eu,why,auth.uid(),statement_timestamp(),p_correlation_id);
  elsif op='ASSIGN_END' then
   eid:=(q->>'assignment_id')::uuid;eu:=(q->>'effective_until')::timestamptz;select * into asgn from public.commission_assignments where id=eid and organization_id=org and location_id=p_location_id;
   if not found then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
   if eu is null or eu<=asgn.effective_from or eu<statement_timestamp() or exists(select 1 from public.commission_accruals where assignment_id=eid and eligible_at>=eu) then raise exception using errcode='22023',message='COMMISSION_RETROACTIVE_DENIED';end if;
   insert into public.commission_assignment_endings values(eid,org,p_location_id,eu,why,auth.uid(),statement_timestamp(),p_correlation_id);
  else
   eid:=(q->>'charge_id')::uuid;select * into r from public.profitability_revenue_facts where charge_id=eid and organization_id=org and location_id=p_location_id;if not found then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
   if op='DECLARE_NO_STOCK' then
    if r.domain<>'SERVICE' or r.live_session_id is not null then raise exception using errcode='22023',message='COST_CONFLICT';end if;
    insert into public.profitability_zero_cost_declarations values(eid,org,p_location_id,auth.uid(),why,statement_timestamp(),p_correlation_id);
   else
    if op='ATTRIBUTE_RETAIL' then
     staff:=(q->>'staff_user_id')::uuid;if r.domain<>'RETAIL' or not exists(select 1 from public.salon_staff s join public.salon_memberships m on m.id=s.membership_id where s.organization_id=org and s.location_id=p_location_id and s.active and m.status='active' and m.user_id=staff) then raise exception using errcode='22023',message='COST_NOT_FOUND';end if;
     insert into public.profitability_retail_performers values(eid,org,p_location_id,staff,auth.uid(),why,statement_timestamp(),p_correlation_id);
    end if;
    perform app_private.commission_accrue(eid);
    -- If explicit attribution was recorded after a refund, replay revenue
    -- adjustments into the new accrual without changing any original fact.
    for f in select pa.*,row_number() over(order by pa.created_at,pa.id) ordinal from public.profitability_adjustments pa where charge_id=eid order by created_at,id loop
     insert into public.commission_adjustments(organization_id,location_id,accrual_id,staff_user_id,source_document_id,amount_minor,reason)
     select org,p_location_id,a.id,a.staff_user_id,f.source_document_id,
      -app_private.cost_round(a.amount_minor::numeric*(select -sum(gross_delta_minor) from public.profitability_adjustments x where x.charge_id=eid and (x.created_at,x.id)<=(f.created_at,f.id)),r.gross_minor)+app_private.cost_round(a.amount_minor::numeric*(select -coalesce(sum(gross_delta_minor),0) from public.profitability_adjustments x where x.charge_id=eid and (x.created_at,x.id)<(f.created_at,f.id)),r.gross_minor),'Historical revenue adjustment replay'
     from public.commission_accruals a where a.charge_id=eid on conflict(accrual_id,source_document_id) do nothing;
    end loop;
   end if;
  end if;
  perform app_private.costing_audit(org,p_location_id,lower(op),eid,why,p_correlation_id);reply:=jsonb_build_object('data',jsonb_build_object('id',eid,'status','SAVED'));
 exception when invalid_parameter_value then get stacked diagnostics err=message_text;reply:=jsonb_build_object('code',err);
 when insufficient_privilege then reply:=jsonb_build_object('code','FORBIDDEN');
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation or not_null_violation then reply:=jsonb_build_object('code','VALIDATION_FAILED');
 when unique_violation then reply:=jsonb_build_object('code','COST_CONFLICT');when foreign_key_violation then reply:=jsonb_build_object('code','COST_NOT_FOUND');end;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,perm);if ctx ? 'code' then return ctx;end if;
 insert into app_private.costing_receipts values(org,p_location_id,auth.uid(),mid,q,reply,statement_timestamp());return reply;
end$$;
revoke all on function public.costing_operation(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.costing_operation(uuid,uuid,jsonb,uuid) to authenticated;

create function app_private.profitability_breakdown(cid uuid,include_cost boolean,include_commission boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.profitability_revenue_facts%rowtype;gross bigint;net bigint;tax bigint;cost bigint;commission bigint;status text;cost_status text;facts jsonb;accrual jsonb;adjustments jsonb;known_count integer;unknown_count integer;pending boolean;is_zero boolean;begin
 select * into r from public.profitability_revenue_facts where charge_id=cid;
 select r.gross_minor+coalesce(sum(gross_delta_minor),0),r.net_minor+coalesce(sum(net_delta_minor),0),r.tax_minor+coalesce(sum(tax_delta_minor),0) into gross,net,tax from public.profitability_adjustments where charge_id=cid;
 select coalesce(sum(total_cost_minor),0),count(*) filter(where status='KNOWN') into cost,known_count from public.direct_cost_facts where finance_document_id=cid or (r.live_session_id is not null and source_session_id=r.live_session_id and source_client_id=r.client_id and organization_id=r.organization_id and location_id=r.location_id);
 select count(*) into unknown_count from (select stock_item_id,source_bowl_id,source_product_id from public.direct_cost_facts where finance_document_id=cid or (r.live_session_id is not null and source_session_id=r.live_session_id and source_client_id=r.client_id and organization_id=r.organization_id and location_id=r.location_id) group by stock_item_id,source_bowl_id,source_product_id having bool_or(status='UNKNOWN') and sum(quantity::numeric)<>0) x;
 pending:=r.live_session_id is not null and exists(select 1 from public.stock_source_events where session_id=r.live_session_id and status<>'PROCESSED');
 is_zero:=exists(select 1 from public.profitability_zero_cost_declarations where charge_id=cid) or (r.live_session_id is not null and not pending and exists(select 1 from public.live_usage where session_id=r.live_session_id) and not exists(select 1 from public.live_usage where session_id=r.live_session_id and prepared_grams is distinct from 0) and not exists(select 1 from public.live_material_reconciliations where session_id=r.live_session_id and prepared_grams is distinct from 0));
 cost_status:=case when unknown_count>0 or pending then case when known_count>0 then 'PARTIAL' else 'UNKNOWN' end when known_count=0 and not is_zero then 'UNKNOWN' else 'KNOWN' end;
 status:=case cost_status when 'PARTIAL' then 'PARTIAL_COST' when 'UNKNOWN' then 'INCOMPLETE_COST' else 'COMPLETE' end;
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('unit_cost_numerator',f.unit_cost_numerator::text,'unit_cost_denominator',f.unit_cost_denominator::text)),'[]') into facts from (select * from public.direct_cost_facts where finance_document_id=cid or (r.live_session_id is not null and source_session_id=r.live_session_id and source_client_id=r.client_id and organization_id=r.organization_id and location_id=r.location_id) order by created_at,id limit 200) f;
 select to_jsonb(a) into accrual from public.commission_accruals a where charge_id=cid;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into adjustments from public.commission_adjustments x where accrual_id=(accrual->>'id')::uuid;
 commission:=coalesce((accrual->>'amount_minor')::bigint,0)+coalesce((select sum(amount_minor) from public.commission_adjustments where accrual_id=(accrual->>'id')::uuid),0);
 return app_private.finance_json(to_jsonb(r)||jsonb_build_object('gross_revenue_minor',gross,'net_revenue_minor',net,'tax_revenue_minor',tax,'recognized_revenue_minor',net,'revenue_basis','NET_OF_TAX',
  'direct_product_cost_minor',case when include_cost and cost_status='KNOWN' then cost end,'known_product_cost_minor',case when include_cost then cost end,'cost_status',cost_status,'profitability_status',status,
  'gross_contribution_minor',case when include_cost and cost_status='KNOWN' then net-cost end,'commission_minor',case when include_commission then commission end,
  'contribution_after_commission_minor',case when include_cost and include_commission and cost_status='KNOWN' then net-cost-commission end,
  'margin_bps',case when include_cost and cost_status='KNOWN' and net<>0 then app_private.cost_round((net-cost)::numeric*10000,net)::integer end,
  'commission_disclosed',include_commission,'cost_facts',case when include_cost then facts else '[]'::jsonb end,'commission_accrual',case when include_commission then accrual end,'commission_adjustments',case when include_commission then adjustments else '[]'::jsonb end,
  'revenue_adjustments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.profitability_adjustments x where charge_id=cid),'cost_method','MOVING_WEIGHTED_AVERAGE','cost_sources_truncated',jsonb_array_length(facts)>=200));
end$$;
revoke all on function app_private.profitability_breakdown(uuid,boolean,boolean) from public,anon,authenticated,service_role;

create function public.costing_snapshot(p_membership_id uuid,p_location_id uuid,p_request jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q jsonb:=p_request;ctx jsonb;org uuid;kind text:=coalesce(q->>'kind','PROFITABILITY');perm text;off integer;since timestamptz;until_time timestamptz;cost_allowed boolean;commission_allowed boolean;staff uuid;charge uuid;items jsonb;policies jsonb;assignments jsonb;basis jsonb;directory jsonb;services jsonb;ending jsonb;total bigint;begin
 perm:=case kind when 'PROFITABILITY' then 'cost.view' when 'COST_BASIS' then 'cost.view' when 'POLICIES' then 'commission.manage_policies' when 'COMMISSION_SELF' then 'commission.view_self' when 'COMMISSION_ALL' then 'commission.view_all' end;
 if perm is null or jsonb_typeof(q)<>'object' or exists(select 1 from jsonb_object_keys(q) k where k not in ('kind','offset','from','until','charge_id','staff_user_id','stock_item_id')) then return jsonb_build_object('code','VALIDATION_FAILED');end if;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,perm);if ctx ? 'code' then return ctx;end if;org:=(ctx->>'organization_id')::uuid;
 begin
  off:=coalesce((q->>'offset')::integer,0);since:=coalesce((q->>'from')::timestamptz,statement_timestamp()-interval '31 days');until_time:=coalesce((q->>'until')::timestamptz,statement_timestamp()+interval '1 day');
  if off not between 0 and 10000 or until_time<=since or until_time-since>interval '366 days' or q ? 'offset' and jsonb_typeof(q->'offset')<>'number' then return jsonb_build_object('code','VALIDATION_FAILED');end if;
  charge:=(q->>'charge_id')::uuid;staff:=(q->>'staff_user_id')::uuid;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then return jsonb_build_object('code','VALIDATION_FAILED');end;
 cost_allowed:=app_private.user_has_permission(org,p_location_id,'cost.view');commission_allowed:=app_private.user_has_permission(org,p_location_id,'commission.view_all');
 items:='[]';policies:='[]';assignments:='[]';basis:='[]';directory:='[]';services:='[]';ending:='[]';total:=0;
 if kind='PROFITABILITY' then
  if charge is not null and not exists(select 1 from public.profitability_revenue_facts where charge_id=charge and organization_id=org and location_id=p_location_id) then return jsonb_build_object('code','COST_NOT_FOUND');end if;
  select count(*) into total from public.profitability_revenue_facts r where organization_id=org and location_id=p_location_id and (charge is not null and charge_id=charge or charge is null and eligible_at>=since and eligible_at<until_time);
  select coalesce(jsonb_agg(app_private.profitability_breakdown(x.charge_id,cost_allowed,commission_allowed)),'[]') into items from (select charge_id from public.profitability_revenue_facts r where organization_id=org and location_id=p_location_id and (charge is not null and charge_id=charge or charge is null and eligible_at>=since and eligible_at<until_time) order by eligible_at desc,charge_id desc limit 50 offset off) x;
 elsif kind in ('COMMISSION_SELF','COMMISSION_ALL') then
  if kind='COMMISSION_SELF' then if staff is not null and staff<>auth.uid() then return jsonb_build_object('code','FORBIDDEN');end if;staff:=auth.uid();end if;
  select count(*) into total from public.commission_accruals where organization_id=org and location_id=p_location_id and (staff is null or staff_user_id=staff) and eligible_at>=since and eligible_at<until_time;
  select coalesce(jsonb_agg(app_private.finance_json(to_jsonb(x))),'[]') into items from (select a.*,
   r.service_name,r.domain,case when app_private.user_has_permission(org,p_location_id,'clients.read') then r.client_id end client_id,
   coalesce((select sum(amount_minor) from public.commission_adjustments ca where ca.accrual_id=a.id),0) adjustment_minor,
   a.amount_minor+coalesce((select sum(amount_minor) from public.commission_adjustments ca where ca.accrual_id=a.id),0) commission_net_minor
   from public.commission_accruals a join public.profitability_revenue_facts r on r.charge_id=a.charge_id where a.organization_id=org and a.location_id=p_location_id and (staff is null or a.staff_user_id=staff) and a.eligible_at>=since and a.eligible_at<until_time order by a.eligible_at desc,a.id desc limit 50 offset off) x;
 elsif kind='COST_BASIS' then
  select count(*) into total from public.stock_cost_basis_events where organization_id=org and location_id=p_location_id and (q->>'stock_item_id' is null or stock_item_id=(q->>'stock_item_id')::uuid);
  select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('quantity_hundredths',x.quantity_hundredths::text,'value_numerator',x.value_numerator::text,'value_denominator',x.value_denominator::text,'incoming_numerator',x.incoming_numerator::text,'incoming_denominator',x.incoming_denominator::text)),'[]') into basis from (select b.* from public.stock_cost_basis_events b where b.organization_id=org and b.location_id=p_location_id and (q->>'stock_item_id' is null or b.stock_item_id=(q->>'stock_item_id')::uuid) order by b.created_at desc,b.id desc limit 50 offset off) x;
 else
  select count(*) into total from public.commission_policies where organization_id=org and location_id=p_location_id;
  select coalesce(jsonb_agg(app_private.finance_json(to_jsonb(x))),'[]') into policies from (select p.*,v.version,v.method,v.rate_bps,v.fixed_minor,v.currency,v.effective_from from public.commission_policies p join lateral(select * from public.commission_policy_versions where policy_id=p.id order by version desc limit 1) v on true where p.organization_id=org and p.location_id=p_location_id order by p.created_at desc,p.id limit 50 offset off) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into assignments from (select a.* from public.commission_assignments a where a.organization_id=org and a.location_id=p_location_id order by created_at desc,id limit 50) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into ending from (select en.* from public.commission_assignment_endings en where en.assignment_id in(select (v->>'id')::uuid from jsonb_array_elements(assignments) v)) x;
 end if;
 if kind in ('POLICIES','PROFITABILITY') and app_private.user_has_permission(org,p_location_id,'commission.manage_policies') then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into directory from(select distinct m.user_id,s.display_name from public.salon_staff s join public.salon_memberships m on m.id=s.membership_id where s.organization_id=org and s.location_id=p_location_id and s.active and m.status='active' order by s.display_name,m.user_id limit 100) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into services from(select id,name,category from public.salon_services where organization_id=org and (location_id is null or location_id=p_location_id) and active order by name,id limit 200) x;
 end if;
 ctx:=app_private.hair_write_context(p_membership_id,p_location_id,perm);if ctx ? 'code' then return ctx;end if;
 return jsonb_build_object('data',jsonb_build_object('organization_id',org,'location_id',p_location_id,'kind',kind,'offset',off,'total',total,'items',items,'policies',policies,'assignments',assignments,'assignment_endings',ending,'cost_basis',basis,'staff',directory,'services',services));
end$$;
revoke all on function public.costing_snapshot(uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.costing_snapshot(uuid,uuid,jsonb) to authenticated;
