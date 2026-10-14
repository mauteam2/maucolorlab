-- Qualify the JSON array operand before integer subtraction; do not rely on
-- PostgreSQL operator precedence for a string key followed by arithmetic.
do $migration$ declare definition text;anchor text;begin
 definition:=pg_get_functiondef('app_private.store_live_session(uuid,uuid,text,text,uuid)'::regprocedure);
 anchor:='(v->''deviations''-(jsonb_array_length(v->''deviations'')-1))';
 if position(anchor in definition)=0 then raise exception 'Recovery array guard anchor absent';end if;
 execute replace(definition,anchor,'((v->''deviations'')-(jsonb_array_length(v->''deviations'')-1))');
end $migration$;
