"""Construct focused costing tests from existing real source fixtures (not mocks)."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/'supabase/tests/stock_live_usage.test.sql'
body=path.read_text(encoding='utf-8').replace(r'fixtures/stock.inc',r'fixtures/costing.inc')
anchor="select pg_temp.move('OPENING','c4000000-0000-4000-8000-000000000112',100);"
body=body.replace(anchor,anchor+"\nselect is(pg_temp.cost_basis('c4000000-0000-4000-8000-000000000111','10',1)#>>'{data,status}','SAVED','reviewed color cost');\nselect is(pg_temp.cost_basis('c4000000-0000-4000-8000-000000000112','20',1)#>>'{data,status}','SAVED','reviewed developer cost');")
anchor="select is((select count(*) from public.stock_movements where movement_type='USAGE'),2::bigint,'no second consumption and no separate waste deduction');"
body=body.replace(anchor,anchor+"\nselect is((select sum(total_cost_minor) from public.direct_cost_facts where source_session_id is not null),900::numeric,'actual 30g each costs 300+600; no planned-gram pricing');\nselect is((select count(*) from public.direct_cost_facts where source_session_id is not null),2::bigint,'same trusted source has one cost fact');")
anchor="select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),60::numeric,'latest reconciliation replaces original consumption with 40g component');"
body=body.replace(anchor,anchor+"\nselect is((select sum(total_cost_minor) from public.direct_cost_facts where source_session_id is not null),1200::numeric,'increased material reconciliation costs exact immutable delta');")
anchor="select is((select sum(quantity_delta) from public.stock_movements where source_session_id is not null and stock_item_id='c4000000-0000-4000-8000-000000000111'),-10::numeric,'original plus correction chain equals latest component, not summed events');"
body=body.replace(anchor,anchor+"\nselect is((select sum(total_cost_minor) from public.direct_cost_facts where source_session_id is not null),300::numeric,'smaller measured quantity creates compensating cost delta');\nselect is((select count(*) from public.direct_cost_facts where correction_of is not null),4::bigint,'corrections reference original immutable basis');")
anchor="select is((select sum(quantity_delta) from public.stock_movements where stock_item_id='c4000000-0000-4000-8000-000000000111'),100::numeric,'measured zero restores latest measured usage');"
body=body.replace(anchor,anchor+"\nselect is((select sum(total_cost_minor) from public.direct_cost_facts where source_session_id is not null),0::numeric,'measured zero consumption restores original cost exactly');\nselect is((select sum(total_cost_minor) from public.direct_cost_facts where correction_of is null and source_session_id is not null),900::numeric,'original usage cost remains immutable');")
(root/'supabase/tests/costing_material_lineage.test.sql').write_text(body,encoding='utf-8',newline='\n')
