-- Correct the lint finding without rewriting an applied function migration.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('public.saas_storage_access(uuid,uuid,text)'::regprocedure);
 if position('ctx jsonb;org uuid;pv uuid;' in body)=0 then raise exception 'Storage access correction anchor absent';end if;
 execute replace(body,'ctx jsonb;org uuid;pv uuid;','ctx jsonb;org uuid;');
end $migration$;
