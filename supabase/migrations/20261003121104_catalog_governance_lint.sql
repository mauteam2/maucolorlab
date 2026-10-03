-- Forward correction; retain the permissions and signatures of the intake boundary.
do $$ declare d text;begin
 d:=pg_get_functiondef('app_private.pilot_catalog_import(uuid,uuid)'::regprocedure);
 if position('pid uuid;did uuid;' in d)=0 then raise exception 'pilot declaration mismatch';end if;
 execute replace(d,'pid uuid;did uuid;','pid uuid;');
end $$;
create or replace function public.catalog_governance(p_operation text,p_catalog_id uuid,p_note text,p_correlation_id uuid,p_previous_id uuid default null) returns jsonb language sql volatile security invoker set search_path='' as $$
 select app_private.catalog_governance_command(p_operation,p_catalog_id,p_note,p_correlation_id,p_previous_id);
$$;
