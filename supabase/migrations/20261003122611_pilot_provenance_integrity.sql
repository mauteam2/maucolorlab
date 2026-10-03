-- Composite rule references preserve catalog/tenant identity independently of RLS.
alter table public.catalog_compatibility_rules add constraint catalog_rule_catalog_identity unique(catalog_id,id);
alter table public.catalog_rule_sources add constraint catalog_rule_source_ownership foreign key(catalog_id,rule_id) references public.catalog_compatibility_rules(catalog_id,id);
do $$ declare d text;n text;begin
 d:=pg_get_functiondef('app_private.pilot_golden_validate(uuid)'::regprocedure);
 n:='if (select count(*) from public.catalog_products where catalog_id=p_id and product_type=''SHADE'')';
 if position(n in d)=0 then raise exception 'pilot golden definition mismatch';end if;
 execute replace(d,n,$guard$if (select count(*) from public.catalog_product_evidence where catalog_id=p_id)<>31
 or (select count(*) from public.catalog_rule_sources where catalog_id=p_id)<>58
 or (select count(*) from public.catalog_brands where catalog_id=p_id)<>1
 or (select count(*) from public.catalog_product_lines where catalog_id=p_id)<>1
 or exists(select 1 from public.catalog_technical_facts f where f.catalog_id=p_id and f.value is not null and not exists(select 1 from public.catalog_fact_sources fs where fs.product_id=f.product_id and fs.key=f.key and fs.catalog_id=p_id))
 or (select count(*) from public.catalog_products where catalog_id=p_id and product_type='SHADE')$guard$);
end $$;
