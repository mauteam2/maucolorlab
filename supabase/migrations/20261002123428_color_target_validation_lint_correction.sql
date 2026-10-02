-- Correct typed initializer lint diagnostics without changing target semantics.
create or replace function app_private.color_target_definition(p_value jsonb,p_org uuid,p_client uuid,p_passport uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare r jsonb; k text; v_ids uuid[]:='{}'::uuid[]; v_id uuid; v_regions jsonb:='[]'::jsonb; v_mixed jsonb;
 v_fields text[]:=array['regionId','level','toneFamily','mixedFamilies','warmth','greyPriority','liftPriority','depositPriority','toneIntent','contrast','preserve','handling','correction','intermediateLevel'];
begin
 if jsonb_typeof(p_value) is distinct from 'object' or not(p_value ?& array['schemaVersion','mode','globalIntent','regions'])
  or exists(select 1 from jsonb_object_keys(p_value) x where x not in ('schemaVersion','mode','globalIntent','regions'))
  or p_value->'schemaVersion'<>'1'::jsonb or p_value->>'mode' not in ('UNIFORM_COLOR','ROOT_REFRESH','ROOT_SHADOW','GREY_COVERAGE','LIGHTENING','TONING','COLOR_CORRECTION','FILL_PREPIGMENTATION','DIMENSIONAL_COLOR','MULTI_REGION_CUSTOM')
  or p_value->>'globalIntent' not in ('PRESERVE','REFRESH','TRANSFORM','CORRECT') or jsonb_typeof(p_value->'regions') is distinct from 'array' then
  raise exception using errcode='23514',message='COLOR_TARGET_INVALID';
 end if;
 if jsonb_typeof(p_value->'mode') is distinct from 'string' or jsonb_typeof(p_value->'globalIntent') is distinct from 'string' then
  raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
 if jsonb_array_length(p_value->'regions') not between 1 and 100 then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
 for r in select value from jsonb_array_elements(p_value->'regions') loop
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& v_fields) or exists(select 1 from jsonb_object_keys(r) x where not(x=any(v_fields))) then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if jsonb_typeof(r->'regionId') is distinct from 'string' then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  v_id:=(r->>'regionId')::uuid;
  if v_id=any(v_ids) or not exists(select 1 from public.hair_regions where id=v_id and organization_id=p_org and client_id=p_client and passport_id=p_passport and status='ACTIVE') then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  v_ids:=array_append(v_ids,v_id);
  foreach k in array array['warmth','greyPriority','liftPriority','depositPriority','toneIntent','contrast','handling','correction'] loop
   if jsonb_typeof(r->k) is distinct from 'string' then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  end loop;
  foreach k in array array['level','intermediateLevel'] loop
   if jsonb_typeof(r->k) not in ('number','null') or (jsonb_typeof(r->k)='number' and (r->>k)::numeric not between 1 and 10) then
    raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  end loop;
  if jsonb_typeof(r->'preserve') is distinct from 'boolean' or jsonb_typeof(r->'mixedFamilies') is distinct from 'array'
   or jsonb_typeof(r->'toneFamily') not in ('string','null')
   or (r->>'toneFamily' is not null and r->>'toneFamily' not in ('NEUTRAL','ASH_COOL','VIOLET','BLUE','GREEN','GOLD_WARM','COPPER','RED','MIXED'))
   or r->>'warmth' not in ('NEUTRAL','COOL','WARM','PRESERVE') or r->>'greyPriority' not in ('NONE','BLEND','COVER')
   or r->>'liftPriority' not in ('NONE','NORMAL','HIGH') or r->>'depositPriority' not in ('NONE','NORMAL','HIGH')
   or r->>'toneIntent' not in ('PRESERVE','NEUTRALIZE','ENHANCE','CHANGE') or r->>'contrast' not in ('NONE','SOFT','PRONOUNCED')
   or r->>'handling' not in ('STANDARD','ISOLATE') or r->>'correction' not in ('NONE','BAND','UNEVEN','REFLECTION','DARK_ACCUMULATION') then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements(r->'mixedFamilies') x where jsonb_typeof(x) is distinct from 'string'
   or x#>>'{}' not in ('NEUTRAL','ASH_COOL','VIOLET','BLUE','GREEN','GOLD_WARM','COPPER','RED'))
   or jsonb_array_length(r->'mixedFamilies')>3 or (select count(distinct x) from jsonb_array_elements(r->'mixedFamilies') x)<>jsonb_array_length(r->'mixedFamilies')
   or ((r->>'toneFamily'='MIXED') and jsonb_array_length(r->'mixedFamilies')<2)
   or ((r->>'toneFamily' is distinct from 'MIXED') and jsonb_array_length(r->'mixedFamilies')<>0) then
   raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if (r->>'preserve')::boolean then
   if r->>'level' is not null or r->>'toneFamily' is not null or r->>'toneIntent'<>'PRESERVE' or r->>'warmth'<>'PRESERVE'
    or r->>'greyPriority'<>'NONE' or r->>'liftPriority'<>'NONE' or r->>'depositPriority'<>'NONE' or r->>'correction'<>'NONE'
    or r->>'intermediateLevel' is not null or jsonb_array_length(r->'mixedFamilies')<>0 then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  elsif r->>'level' is null or (r->>'toneIntent'<>'PRESERVE' and r->>'toneFamily' is null) then
   raise exception using errcode='23514',message='COLOR_TARGET_INCOMPLETE';
  end if;
  if (r->>'liftPriority'<>'NONE' and r->>'depositPriority'<>'NONE') then raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
  if r->>'correction' in ('BAND','DARK_ACCUMULATION') and r->>'intermediateLevel' is null then raise exception using errcode='23514',message='COLOR_TARGET_INCOMPLETE'; end if;
  select coalesce(jsonb_agg(x order by x),'[]'::jsonb) into v_mixed from jsonb_array_elements(r->'mixedFamilies') x;
  v_regions:=v_regions||jsonb_build_array(r||jsonb_build_object('regionId',v_id,'mixedFamilies',v_mixed));
 end loop;
 if exists(select 1 from public.hair_regions where organization_id=p_org and passport_id=p_passport and status='ACTIVE' and not(id=any(v_ids))) then
  raise exception using errcode='23514',message='COLOR_TARGET_INCOMPLETE'; end if;
 if p_value->>'mode'='UNIFORM_COLOR' and (exists(select 1 from jsonb_array_elements(v_regions) x where (x->>'preserve')::boolean)
  or (select count(distinct jsonb_build_array(x->'level',x->'toneFamily',x->'mixedFamilies',x->'warmth')) from jsonb_array_elements(v_regions) x)>1) then
  raise exception using errcode='23514',message='COLOR_TARGET_INVALID'; end if;
 select jsonb_agg(x order by x->>'regionId') into v_regions from jsonb_array_elements(v_regions) x;
 return p_value||jsonb_build_object('regions',v_regions);
end $$;
