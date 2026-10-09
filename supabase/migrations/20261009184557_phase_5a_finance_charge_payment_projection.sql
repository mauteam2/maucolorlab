-- Complete the appointment payment projection from immutable allocation facts.
do $$declare body text;anchor text;begin
 body:=pg_get_functiondef('public.finance_snapshot(uuid,uuid,jsonb)'::regprocedure);
 anchor:='app_private.finance_outstanding(d.id) outstanding_minor,';
 if position(anchor in body)=0 then raise exception 'Finance charge projection changed';end if;
 body:=replace(body,anchor,anchor||' (select coalesce(sum(a.amount_minor),0) from public.finance_payment_allocations a join public.finance_documents p on p.id=a.payment_id where a.charge_id=d.id and p.type=''DEPOSIT'') deposit_applied_minor,');
 execute body;
end $$;
