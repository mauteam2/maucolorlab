-- PostgreSQL fires BEFORE INSERT for the existing-session UPSERT too.
-- Existing signed service mutations retain their original controller/version/
-- signature checks and must not be mistaken for a new premium session.
do $migration$ declare body text;anchor text;begin
 body:=pg_get_functiondef('app_private.saas_source_gate()'::regprocedure);
 anchor:='elsif tg_table_name=''live_sessions'' then cap:=''LIVE_SESSION'';perm:=''live_session.start'';';
 if position(anchor in body)=0 then raise exception 'Live source gate anchor absent';end if;
 execute replace(body,anchor,'elsif tg_table_name=''live_sessions'' then
  if exists(select 1 from public.live_sessions s where s.id=(j->>''id'')::uuid and s.organization_id=org and s.location_id=loc) then return new;end if;
  cap:=''LIVE_SESSION'';perm:=''live_session.start'';');
end $migration$;
