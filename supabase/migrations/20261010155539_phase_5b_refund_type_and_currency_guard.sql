-- SUM(bigint) is NUMERIC in PostgreSQL; the validated capped adjustment takes bigint.
do $$declare body text;begin
 body:=pg_get_functiondef('app_private.profitability_refund_posted()'::regprocedure);
 body:=replace(body,'(select -sum(amount_minor) from public.finance_payment_allocations','(select (-sum(amount_minor))::bigint from public.finance_payment_allocations');execute body;
 body:=pg_get_functiondef('app_private.cost_currency_guard()'::regprocedure);
 body:=replace(body,'errcode=''22023''','errcode=''23514''');execute body;
end$$;
