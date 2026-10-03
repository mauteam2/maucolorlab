-- A compatibility claim is for a documented ratio as well as an exact product,
-- developer, technique and application context. Unknown ratio remains null.
alter table public.catalog_compatibility_rules add column mixing_ratio text
 check(mixing_ratio is null or (char_length(mixing_ratio) between 3 and 200 and mixing_ratio ~ '^[0-9]+([.][0-9]+)?:[0-9]+([.][0-9]+)?$'));
do $$ declare d text;n text;
begin
 d:=pg_get_functiondef('public.brand_catalog_packet(uuid)'::regprocedure);
 n:='''applicationContext'',application_context,''outcome'',outcome';
 if position(n in d)=0 then raise exception 'compatibility packet definition mismatch';end if;
 execute replace(d,n,'''applicationContext'',application_context,''mixingRatio'',mixing_ratio,''outcome'',outcome');
end $$;
