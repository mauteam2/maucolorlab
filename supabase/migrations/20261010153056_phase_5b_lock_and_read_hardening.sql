-- Use the EXISTING finance-main advisory key, not a second protocol.
do $$declare body text;begin
 body:=pg_get_functiondef('public.costing_operation(uuid,uuid,jsonb,uuid)'::regprocedure);
 if position(''':MAIN''' in body)=0 then raise exception 'Costing finance lock anchor changed';end if;
 body:=replace(body,''':MAIN''',''':finance-main''');
 execute body;
end$$;
do $$declare body text;begin
 body:=pg_get_functiondef('app_private.profitability_breakdown(uuid,boolean,boolean)'::regprocedure);
 body:=replace(body,'status text;cost_status text;','projection_status text;cost_status text;');
 body:=replace(body,'status:=case cost_status','projection_status:=case cost_status');
 body:=replace(body,'''profitability_status'',status','''profitability_status'',projection_status');
 execute body;
end$$;
-- Source lookup indexes support bounded per-charge reads and refund replay.
create index profitability_adjustment_charge on public.profitability_adjustments(charge_id,created_at,id) include(gross_delta_minor,net_delta_minor,tax_delta_minor);
create index commission_adjustment_accrual on public.commission_adjustments(accrual_id) include(amount_minor);
create index commission_assignment_lookup on public.commission_assignments(organization_id,location_id,staff_user_id,effective_from,policy_id);
create index stock_cost_scope on public.stock_cost_basis_events(organization_id,location_id,created_at desc,id);
create index profitability_source_charge on public.finance_payment_allocations(source_document_id,charge_id) include(amount_minor);
