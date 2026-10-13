-- Keep normal Finance RLS intact; authorize the narrowly scoped day aggregate
-- once instead of evaluating the same membership predicates for 10,000 facts.
-- Match both ordering columns so a bounded document page does not sort/filter
-- the entire same-timestamp population before its LIMIT.
create index finance_document_page_order on public.finance_documents(organization_id,location_id,occurred_at desc,id desc);
create index finance_document_client_page_order on public.finance_documents(organization_id,location_id,client_id,occurred_at desc,id desc);
do $migration$ declare body text;start_pos integer;end_pos integer;query_block text;begin
 body:=pg_get_functiondef('public.finance_snapshot(uuid,uuid,jsonb)'::regprocedure);
 start_pos:=strpos(body,E' select jsonb_build_object(\n  ''service_charges_minor'',');
 end_pos:=strpos(body,' select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) into clients');
 if start_pos=0 or end_pos<=start_pos then raise exception 'Finance period summary anchors changed';end if;
 query_block:=substr(body,start_pos,end_pos-start_pos);
 query_block:=replace(query_block,'p_location_id','loc');
 query_block:=replace(query_block,'on r.id=d.reversal_of where','on r.id=d.reversal_of and r.organization_id=org and r.location_id=loc where');
 query_block:=replace(query_block,'where v.reversal_of=d2.id','where v.reversal_of=d2.id and v.organization_id=org and v.location_id=loc');
 execute format($definition$create function app_private.finance_period_summary(org uuid,loc uuid,from_time timestamptz,to_time timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $function$
 declare summary jsonb;expenses_allowed boolean;begin
  if not app_private.user_has_permission(org,loc,'finance.view') then raise exception using errcode='42501',message='FORBIDDEN';end if;
  if from_time is null or to_time is null or to_time<=from_time or to_time-from_time>interval '2 days' then raise exception using errcode='22023',message='VALIDATION_FAILED';end if;
  expenses_allowed:=app_private.user_has_permission(org,loc,'finance.expense.view');
  %s
  return summary;
 end $function$;$definition$,query_block);
 body:=overlay(body placing E' summary:=app_private.finance_period_summary(org,p_location_id,from_time,to_time);\n' from start_pos for end_pos-start_pos);execute body;
end $migration$;
revoke all on function app_private.finance_period_summary(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function app_private.finance_period_summary(uuid,uuid,timestamptz,timestamptz) to elifora_finance_writer;
