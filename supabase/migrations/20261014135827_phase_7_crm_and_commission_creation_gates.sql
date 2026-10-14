-- New relationship actions and future commission assignments are premium work;
-- existing action closure/assignment endings and accrued history remain allowed.
do $migration$ declare body text;anchor text;begin
 body:=pg_get_functiondef('app_private.saas_source_gate()'::regprocedure);
 anchor:='elsif tg_table_name=''commission_policy_versions'' then cap:=''COMMISSION'';perm:=''commission.manage_policies'';';
 if position(anchor in body)=0 then raise exception 'Commission source anchor absent';end if;
 execute replace(body,anchor,'elsif tg_table_name=''client_crm_actions'' then cap:=''CRM'';perm:=''crm.actions.manage'';
 elsif tg_table_name in (''commission_policy_versions'',''commission_assignments'') then cap:=''COMMISSION'';perm:=''commission.manage_policies'';');
end $migration$;
create trigger saas_new_crm_action before insert on public.client_crm_actions for each row execute function app_private.saas_source_gate();
create trigger saas_new_commission_assignment before insert on public.commission_assignments for each row execute function app_private.saas_source_gate();
