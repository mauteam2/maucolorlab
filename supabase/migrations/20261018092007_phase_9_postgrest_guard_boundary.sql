-- PostgREST invokes its hook under the request role. A no-data public wrapper
-- avoids granting anon/service_role USAGE on the private application schema.
create function public.request_session_guard() returns void
language sql stable security definer set search_path='' as $$
 select app_private.require_active_session();
$$;
revoke all on function public.request_session_guard() from public;
grant execute on function public.request_session_guard() to anon,authenticated,service_role;
revoke execute on function app_private.require_active_session() from anon,service_role;
alter role authenticator set pgrst.db_pre_request='public.request_session_guard';
notify pgrst,'reload config';

-- Actual catalog review found these legacy private receipts were ACL-only.
alter table app_private.stock_receipts enable row level security;
alter table app_private.finance_receipts enable row level security;
alter table app_private.costing_receipts enable row level security;
alter table app_private.cost_intake_requests enable row level security;
create policy stock_receipt_read on app_private.stock_receipts for select to elifora_stock_writer
using(actor_id=auth.uid() and app_private.can_access_clients(organization_id,'stock.view'));
create policy stock_receipt_insert on app_private.stock_receipts for insert to elifora_stock_writer
with check(actor_id=auth.uid() and app_private.can_access_clients(organization_id,'stock.view'));
create policy finance_receipt_read on app_private.finance_receipts for select to elifora_finance_writer
using(actor_id=auth.uid() and app_private.user_has_permission(organization_id,location_id,'finance.view'));
create policy finance_receipt_insert on app_private.finance_receipts for insert to elifora_finance_writer
with check(actor_id=auth.uid() and app_private.user_has_permission(organization_id,location_id,'finance.view'));
-- Costing receipts/intake remain postgres-helper-only, with no client/writer ACL.
