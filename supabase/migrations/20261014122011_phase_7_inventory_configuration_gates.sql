-- Inventory setup is new work too; historical consumption compensation remains
-- exempt only through the existing validated outbox/reversal relations.
do $migration$ declare body text;begin
 body:=pg_get_functiondef('app_private.saas_source_gate()'::regprocedure);
 body:=replace(body,' elsif tg_table_name=''stock_movements'' then',
  ' elsif tg_table_name in (''stock_items'',''stock_settings'') then cap:=''STOCK'';perm:=''stock.manage_items'';
 elsif tg_table_name=''stock_lots'' then cap:=''STOCK'';perm:=''stock.manage_lots'';
 elsif tg_table_name=''stock_movements'' then');execute body;
end $migration$;
create trigger saas_new_inventory_item before insert on public.stock_items for each row execute function app_private.saas_source_gate();
create trigger saas_new_inventory_lot before insert on public.stock_lots for each row execute function app_private.saas_source_gate();
create trigger saas_inventory_configuration before insert or update on public.stock_settings for each row execute function app_private.saas_source_gate();
