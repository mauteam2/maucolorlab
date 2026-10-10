-- Snapshot query fields are optional; mutation commands still require exact keys.
do $$declare body text;anchor text;begin
 body:=pg_get_functiondef('public.finance_snapshot(uuid,uuid,jsonb)'::regprocedure);
 anchor:='not app_private.salon_keys(p_request,array[''day'',''client_id'',''appointment_id'',''document_id'',''offset''])';
 if position(anchor in body)=0 then raise exception 'Finance optional query validation changed';end if;
 body:=replace(body,anchor,'exists(select 1 from jsonb_object_keys(p_request) k where k not in (''day'',''client_id'',''appointment_id'',''document_id'',''offset''))');
 execute body;
end $$;
