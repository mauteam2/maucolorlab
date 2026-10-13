-- Expense authorization moved into the bounded private period aggregate.
-- Remove its obsolete caller variable/assignment; do not suppress lint warnings.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('public.finance_snapshot(uuid,uuid,jsonb)'::regprocedure);
 body:=replace(body,'expenses_allowed boolean;cash_allowed boolean;','cash_allowed boolean;');
 body:=replace(body,'expenses_allowed:=app_private.user_has_permission(org,p_location_id,''finance.expense.view'');','');
 execute body;
end $migration$;
