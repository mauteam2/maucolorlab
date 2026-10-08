-- Forward correction discovered by PostgreSQL lint on the disposable CI DB.
-- Parenthesize JSON extraction before array subtraction; do not rely on
-- operator precedence. Keep all previous grants/ownership/guards unchanged.
do $$declare d text;n text;begin
 d:=pg_get_functiondef('app_private.store_live_session(uuid,uuid,text,text,uuid)'::regprocedure);
 n:='(v->''materialReconciliations''-(jsonb_array_length(v->''materialReconciliations'')-1))';
 if position(n in d)=0 then raise exception 'material expression definition mismatch';end if;
 d:=replace(d,n,'((v->''materialReconciliations'')-(jsonb_array_length(v->''materialReconciliations'')-1))');
 n:='select jsonb_agg(distinct region.value) into regions from jsonb_array_elements(v->''bowls'') b,lateral jsonb_array_elements(b->''regionIds'') region;';
 if position(n in d)=0 then raise exception 'outcome regions definition mismatch';end if;
 d:=replace(d,n,'select jsonb_agg(distinct region.value) into regions from jsonb_array_elements(v->''bowls'') b,lateral jsonb_array_elements(b->''regionIds'') region where coalesce((b->>''usedGrams'')::numeric,0)>0 or exists(select 1 from jsonb_array_elements(v->''steps'') st where st->>''bowlId''=b->>''id'' and st->>''status''<>''SUPERSEDED'');');
 execute d;
end $$;

-- A failed conditional identity write must roll back the entire function block.
-- In particular, do not return after a preceding target update has succeeded.
do $$declare d text;n text;begin
 d:=pg_get_functiondef('app_private.crm_operation(uuid,uuid,jsonb,uuid)'::regprocedure);
 n:='if not found then return jsonb_build_object(''code'',''CRM_CONFLICT'');end if;';
 if position(n in d)=0 then raise exception 'identity conditional write definition mismatch';end if;
 d:=replace(d,n,'if not found then raise exception using errcode=''40001'',message=''CRM_CONFLICT'';end if;');
 n:='when unique_violation then return jsonb_build_object(''code'',''CRM_CONFLICT'');';
 if position(n in d)=0 then raise exception 'identity conflict handler definition mismatch';end if;
 d:=replace(d,n,'when unique_violation or serialization_failure then return jsonb_build_object(''code'',''CRM_CONFLICT'');');
 execute d;
end $$;
