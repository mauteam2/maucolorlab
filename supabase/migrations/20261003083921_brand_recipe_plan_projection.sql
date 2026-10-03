-- Keep the Phase 1F envelope/signature columns private. The Brand writer needs
-- only the already caller-readable plan fields and continues to run under RLS.
do $$ declare d text;n text;
begin
 d:=pg_get_functiondef('app_private.store_brand_recipe(uuid,uuid,text,text,uuid)'::regprocedure);
 n:='select * into pl from public.color_plans';
 if position(n in d)=0 then raise exception 'brand plan projection definition mismatch';end if;
 execute replace(d,n,'select id,organization_id,client_id,target_version_id,passport_version,status,recipe_id,payload into pl.id,pl.organization_id,pl.client_id,pl.target_version_id,pl.passport_version,pl.status,pl.recipe_id,pl.payload from public.color_plans');
end $$;
